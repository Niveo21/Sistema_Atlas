const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');

const PASSWORD = 'Clave-Segura-2026';
const hoy = new Date();
const fecha = (dias) => new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10);

async function registrar(nombreUsuario) {
  const res = await request(app).post('/api/auth/register').send({
    nombre_usuario: nombreUsuario, correo: `${nombreUsuario}@atlas.test`, password: PASSWORD,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function login(nombreUsuario) {
  const res = await request(app).post('/api/auth/login').send({ nombre_usuario: nombreUsuario, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

let adminToken;
let editorToken;
let externoToken;
let empresaId;
let clienteId;

beforeAll(async () => {
  await pool.query('TRUNCATE auditoria, token_revocado, enlace_compartido, documento, contrato, cliente, empresa_usuarios, empresa, usuario RESTART IDENTITY CASCADE');
  await registrar('admin_test');
  await registrar('editor_test');
  await registrar('externo_test');
  adminToken = await login('admin_test');
  editorToken = await login('editor_test');
  externoToken = await login('externo_test');
});

afterAll(async () => {
  await pool.end();
});

describe('Autenticación (RF-1, RF-2)', () => {
  test('rechaza contraseñas que no cumplen la política', async () => {
    const res = await request(app).post('/api/auth/register').send({
      nombre_usuario: 'debil', correo: 'debil@atlas.test', password: 'corta',
    });
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test('rechaza un nombre de usuario duplicado con 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      nombre_usuario: 'admin_test', correo: 'otro@atlas.test', password: PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  test('rechaza credenciales inválidas con 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ nombre_usuario: 'admin_test', password: 'incorrecta-123A!' });
    expect(res.status).toBe(401);
  });

  test('exige token en rutas protegidas', async () => {
    const res = await request(app).get('/api/empresas');
    expect(res.status).toBe(401);
  });
});

describe('Empresas y roles (RF-2.2, RF-2.3, RF-3)', () => {
  test('quien crea la empresa queda como administrador', async () => {
    const res = await request(app).post('/api/empresas').set('Authorization', `Bearer ${adminToken}`).send({
      nombre: 'Ferretería Test', direccion: 'Av. Principal 123', telefono: '+56 2 2345 6789', correo: 'contacto@ferreteria.test',
    });
    expect(res.status).toBe(201);
    empresaId = res.body.id;

    const lista = await request(app).get('/api/empresas').set('Authorization', `Bearer ${adminToken}`);
    expect(lista.body.data[0]).toMatchObject({ id: empresaId, rol: 'administrador' });
  });

  test('el administrador asigna rol editor a un usuario registrado', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/usuarios`)
      .set('Authorization', `Bearer ${adminToken}`).send({ nombre_usuario: 'editor_test', rol: 'editor' });
    expect(res.status).toBe(201);
  });

  test('un usuario fuera de la empresa no la ve (404)', async () => {
    const res = await request(app).get(`/api/empresas/${empresaId}/clientes`).set('Authorization', `Bearer ${externoToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Clientes (RF-4) y control de acceso por rol (RB-4, RB-5)', () => {
  test('el administrador crea un cliente', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/clientes`)
      .set('Authorization', `Bearer ${adminToken}`).send({ nombre: 'Cliente Uno', contacto: 'cliente1@test.cl' });
    expect(res.status).toBe(201);
    clienteId = res.body.id;
  });

  test('el editor puede listar clientes pero no crearlos (403)', async () => {
    const lista = await request(app).get(`/api/empresas/${empresaId}/clientes`).set('Authorization', `Bearer ${editorToken}`);
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);

    const crea = await request(app).post(`/api/empresas/${empresaId}/clientes`)
      .set('Authorization', `Bearer ${editorToken}`).send({ nombre: 'No debería' });
    expect(crea.status).toBe(403);
  });

  test('la eliminación exige confirmación explícita', async () => {
    const res = await request(app).delete(`/api/empresas/${empresaId}/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test('la eliminación con confirmación es lógica y oculta el cliente', async () => {
    const res = await request(app).delete(`/api/empresas/${empresaId}/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ confirmar: true });
    expect(res.status).toBe(204);

    const lista = await request(app).get(`/api/empresas/${empresaId}/clientes`).set('Authorization', `Bearer ${adminToken}`);
    expect(lista.body.total).toBe(0);
  });
});

describe('Contratos (RF-5.1, RF-5.4, RB-3)', () => {
  let contratoClienteId;

  beforeAll(async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/clientes`)
      .set('Authorization', `Bearer ${adminToken}`).send({ nombre: 'Cliente Contratos' });
    contratoClienteId = res.body.id;
  });

  test('rechaza fechas con término anterior al inicio', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/clientes/${contratoClienteId}/contratos`)
      .set('Authorization', `Bearer ${adminToken}`).send({ titulo: 'Malo', fecha_inicio: fecha(10), fecha_termino: fecha(5) });
    expect(res.status).toBe(400);
  });

  test('calcula el estado del contrato a partir de las fechas', async () => {
    await request(app).post(`/api/empresas/${empresaId}/clientes/${contratoClienteId}/contratos`)
      .set('Authorization', `Bearer ${adminToken}`).send({ titulo: 'Vigente', fecha_inicio: fecha(-10), fecha_termino: fecha(365) });
    await request(app).post(`/api/empresas/${empresaId}/clientes/${contratoClienteId}/contratos`)
      .set('Authorization', `Bearer ${adminToken}`).send({ titulo: 'Vencido', fecha_inicio: fecha(-400), fecha_termino: fecha(-1) });

    const res = await request(app).get(`/api/empresas/${empresaId}/clientes/${contratoClienteId}/contratos`)
      .set('Authorization', `Bearer ${editorToken}`);
    const estados = Object.fromEntries(res.body.data.map((c) => [c.titulo, c.estado]));
    expect(estados).toEqual({ Vigente: 'activo', Vencido: 'expirado' });
  });
});

describe('Cierre de sesión (RF-1.2)', () => {
  test('el token deja de funcionar después del logout', async () => {
    const token = await login('externo_test');
    const antes = await request(app).get('/api/empresas').set('Authorization', `Bearer ${token}`);
    expect(antes.status).toBe(200);

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(204);

    const despues = await request(app).get('/api/empresas').set('Authorization', `Bearer ${token}`);
    expect(despues.status).toBe(401);
  });
});

describe('Auditoría (RF-6.1)', () => {
  test('las acciones críticas quedan registradas', async () => {
    const { rows } = await pool.query(
      "SELECT accion FROM auditoria WHERE empresa_id = $1 AND accion IN ('crear','eliminar','cambio_rol')", [empresaId]
    );
    const acciones = rows.map((r) => r.accion);
    expect(acciones).toEqual(expect.arrayContaining(['crear', 'eliminar', 'cambio_rol']));
  });
});
