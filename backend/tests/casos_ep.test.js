// Pruebas de los casos CP-01, CP-02, CP-03, CP-08, CP-09, CP-10, CP-14, CP-15 y CP-17 del plan de pruebas v2.
// Cada prueba indica el caso y el requisito del ERS que verifica.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { pool } = require('../src/db');

const PASSWORD = 'Clave-Segura-2026';
const hoy = new Date();
const fecha = (dias) => new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10);

async function registrar(nombreUsuario) {
  const res = await request(app).post('/api/auth/register').send({
    nombre_usuario: nombreUsuario, correo: `${nombreUsuario}@atlas.test`, password: PASSWORD,
  });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ nombre_usuario: nombreUsuario, password: PASSWORD });
  return login.body.token;
}

let adminA;
let editorA;
let adminB;
let empresaA;
let empresaB;
let clienteA;
let contratoA;
let documentoA;

beforeAll(async () => {
  await pool.query('TRUNCATE auditoria, token_revocado, enlace_compartido, documento, contrato, cliente, empresa_usuarios, empresa, usuario RESTART IDENTITY CASCADE');
  adminA = await registrar('ep_admin_a');
  editorA = await registrar('ep_editor_a');
  adminB = await registrar('ep_admin_b');

  const ea = await request(app).post('/api/empresas').set('Authorization', `Bearer ${adminA}`).send({
    nombre: 'Empresa A', direccion: 'Calle A 1', telefono: '+56 2 1111 1111', correo: 'a@empresa.test',
  });
  empresaA = ea.body.id;
  await request(app).post(`/api/empresas/${empresaA}/usuarios`).set('Authorization', `Bearer ${adminA}`)
    .send({ nombre_usuario: 'ep_editor_a', rol: 'editor' });

  const eb = await request(app).post('/api/empresas').set('Authorization', `Bearer ${adminB}`).send({
    nombre: 'Empresa B', direccion: 'Calle B 2', telefono: '+56 2 2222 2222', correo: 'b@empresa.test',
  });
  empresaB = eb.body.id;

  const ca = await request(app).post(`/api/empresas/${empresaA}/clientes`).set('Authorization', `Bearer ${adminA}`)
    .send({ nombre: 'Cliente A' });
  clienteA = ca.body.id;
  const co = await request(app).post(`/api/empresas/${empresaA}/clientes/${clienteA}/contratos`)
    .set('Authorization', `Bearer ${adminA}`).send({ titulo: 'Contrato A', fecha_inicio: fecha(-10), fecha_termino: fecha(365) });
  contratoA = co.body.id;

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
  const dA = await request(app).post(`/api/empresas/${empresaA}/contratos/${contratoA}/documentos`)
    .set('Authorization', `Bearer ${adminA}`).attach('archivo', pdf, { filename: 'contrato_a.pdf', contentType: 'application/pdf' });
  documentoA = dA.body.id;
});

afterAll(async () => {
  await pool.end();
});

describe('CP-01 Autenticación y sesión (RF-1.1, RF-1.2, NFR-SEG-2, NFR-SEG-9)', () => {
  test('el login válido entrega un JWT HS256 con expiración de 15 minutos', async () => {
    const res = await request(app).post('/api/auth/login').send({ nombre_usuario: 'ep_admin_a', password: PASSWORD });
    expect(res.status).toBe(200);
    const payload = jwt.decode(res.body.token, { complete: true });
    expect(payload.header.alg).toBe('HS256');
    expect(payload.payload.exp - payload.payload.iat).toBe(900);
  });

  test('credenciales incorrectas y usuario inexistente devuelven el mismo mensaje genérico', async () => {
    const mala = await request(app).post('/api/auth/login').send({ nombre_usuario: 'ep_admin_a', password: 'Incorrecta-2026!' });
    const inexistente = await request(app).post('/api/auth/login').send({ nombre_usuario: 'no_existe_xx', password: 'Incorrecta-2026!' });
    expect(mala.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(mala.body).toEqual(inexistente.body);
  });

  test('ninguna respuesta de login expone la contraseña ni su hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ nombre_usuario: 'ep_admin_a', password: PASSWORD });
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(PASSWORD);
    expect(texto).not.toContain('$2');
  });
});

describe('CP-02 Permisos del rol Editor (RF-3.2, RB-4, NFR-SEG-4)', () => {
  test('el editor no puede crear contratos ni eliminar clientes (403) y no cambia la base', async () => {
    const antes = await pool.query('SELECT count(*)::int AS n FROM contrato WHERE cliente_id = $1', [clienteA]);
    const crea = await request(app).post(`/api/empresas/${empresaA}/clientes/${clienteA}/contratos`)
      .set('Authorization', `Bearer ${editorA}`).send({ titulo: 'No debería', fecha_inicio: fecha(0), fecha_termino: fecha(30) });
    const borra = await request(app).delete(`/api/empresas/${empresaA}/clientes/${clienteA}`)
      .set('Authorization', `Bearer ${editorA}`).send({ confirmar: true });
    expect(crea.status).toBe(403);
    expect(borra.status).toBe(403);
    const despues = await pool.query('SELECT count(*)::int AS n FROM contrato WHERE cliente_id = $1', [clienteA]);
    expect(despues.rows[0].n).toBe(antes.rows[0].n);
  });
});

describe('CP-03 Validación de entradas (NFR-SEG-5, RF-4.3)', () => {
  test('una inyección SQL en el filtro no altera la tabla de clientes', async () => {
    const antes = await pool.query('SELECT count(*)::int AS n FROM cliente');
    const res = await request(app).get(`/api/empresas/${empresaA}/clientes`)
      .query({ q: "'; DROP TABLE cliente; --" }).set('Authorization', `Bearer ${adminA}`);
    expect(res.status).toBe(200);
    const despues = await pool.query('SELECT count(*)::int AS n FROM cliente');
    expect(despues.rows[0].n).toBe(antes.rows[0].n);
  });

  test('un script almacenado se guarda como texto y la respuesta no emite cookies', async () => {
    const res = await request(app).post(`/api/empresas/${empresaA}/clientes`).set('Authorization', `Bearer ${adminA}`)
      .send({ nombre: '<script>alert("XSS")</script>' });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('un error de JSON mal formado no revela trazas ni detalles técnicos', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"nombre_usuario": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at Object|postgres|SELECT/i);
  });
});

describe('CP-08 Auditoría de acciones críticas (RF-6.1, NFR-SEG-6)', () => {
  test('crear, editar y eliminar un cliente generan un evento cada uno', async () => {
    const crea = await request(app).post(`/api/empresas/${empresaA}/clientes`).set('Authorization', `Bearer ${adminA}`)
      .send({ nombre: 'Cliente Auditoría' });
    const id = crea.body.id;
    await request(app).put(`/api/empresas/${empresaA}/clientes/${id}`).set('Authorization', `Bearer ${adminA}`)
      .send({ nombre: 'Cliente Auditoría editado' });
    await request(app).delete(`/api/empresas/${empresaA}/clientes/${id}`).set('Authorization', `Bearer ${adminA}`)
      .send({ confirmar: true });
    const { rows } = await pool.query(
      "SELECT accion FROM auditoria WHERE empresa_id = $1 AND entidad = 'cliente' AND entidad_id = $2 ORDER BY id",
      [empresaA, id]
    );
    expect(rows.map((r) => r.accion)).toEqual(['crear', 'editar', 'eliminar']);
  });

  test('la auditoría no almacena contraseñas en texto plano', async () => {
    const { rows } = await pool.query('SELECT detalle::text AS d FROM auditoria');
    for (const r of rows) {
      expect(r.d || '').not.toContain(PASSWORD);
    }
  });
});

describe('CP-09 Estado del contrato y valores límite (RF-5.1, RF-5.4, RB-3)', () => {
  let clienteC;

  beforeAll(async () => {
    const res = await request(app).post(`/api/empresas/${empresaA}/clientes`).set('Authorization', `Bearer ${adminA}`)
      .send({ nombre: 'Cliente Estados' });
    clienteC = res.body.id;
  });

  async function crear(titulo, inicio, termino) {
    return request(app).post(`/api/empresas/${empresaA}/clientes/${clienteC}/contratos`)
      .set('Authorization', `Bearer ${adminA}`).send({ titulo, fecha_inicio: inicio, fecha_termino: termino });
  }

  test('el término a 30 días es "vence" y a 31 días es "activo" (límite)', async () => {
    await crear('Límite 30', fecha(-5), fecha(30));
    await crear('Límite 31', fecha(-5), fecha(31));
    const res = await request(app).get(`/api/empresas/${empresaA}/clientes/${clienteC}/contratos`).set('Authorization', `Bearer ${adminA}`);
    const estados = Object.fromEntries(res.body.data.map((c) => [c.titulo, c.estado]));
    expect(estados['Límite 30']).toBe('vence');
    expect(estados['Límite 31']).toBe('activo');
  });

  test('un contrato cuyo término es hoy figura como "vence" y uno vencido ayer como "expirado"', async () => {
    await crear('Vence hoy', fecha(-30), fecha(0));
    await crear('Venció ayer', fecha(-60), fecha(-1));
    const res = await request(app).get(`/api/empresas/${empresaA}/clientes/${clienteC}/contratos`).set('Authorization', `Bearer ${adminA}`);
    const estados = Object.fromEntries(res.body.data.map((c) => [c.titulo, c.estado]));
    expect(estados['Vence hoy']).toBe('vence');
    expect(estados['Venció ayer']).toBe('expirado');
  });

  test('un contrato con término anterior al inicio se rechaza (400) y no se guarda', async () => {
    const res = await crear('Fechas invertidas', fecha(90), fecha(60));
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM contrato WHERE titulo = 'Fechas invertidas'");
    expect(rows[0].n).toBe(0);
  });

  test('un contrato no puede asociarse a un cliente de otra empresa', async () => {
    const res = await request(app).post(`/api/empresas/${empresaB}/clientes/${clienteC}/contratos`)
      .set('Authorization', `Bearer ${adminB}`).send({ titulo: 'Cruzado', fecha_inicio: fecha(0), fecha_termino: fecha(30) });
    expect(res.status).toBe(404);
  });
});

describe('CP-10 Registro y creación de empresa (RF-2.1, RF-2.2, RF-2.3, RB-1, política de contraseñas)', () => {
  test('una contraseña de 11 caracteres se rechaza (400)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      nombre_usuario: 'ep_corta', correo: 'corta@atlas.test', password: 'Abcdefgh1!x',
    });
    expect(res.status).toBe(400);
  });

  test('un correo ya registrado se rechaza (409), según la regla de correo único (D-5)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      nombre_usuario: 'ep_otro_usuario', correo: 'ep_admin_a@atlas.test', password: PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  test('quien crea la empresa queda como administrador (RF-2.3)', async () => {
    const lista = await request(app).get('/api/empresas').set('Authorization', `Bearer ${adminB}`);
    expect(lista.body.data.find((e) => e.id === empresaB)).toMatchObject({ rol: 'administrador' });
  });
});

describe('CP-14 Documentos (RF-5.2, RF-5.3, restricción de almacenamiento)', () => {
  test('un archivo cuyo contenido no corresponde a su extensión se rechaza', async () => {
    const exe = Buffer.from('MZ\x90\x00 ejecutable de prueba');
    const res = await request(app).post(`/api/empresas/${empresaA}/contratos/${contratoA}/documentos`)
      .set('Authorization', `Bearer ${adminA}`).attach('archivo', exe, { filename: 'falso.pdf', contentType: 'application/pdf' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('la ruta interna del archivo no aparece en la respuesta ni en la lista', async () => {
    const res = await request(app).get(`/api/empresas/${empresaA}/contratos/${contratoA}/documentos`)
      .set('Authorization', `Bearer ${adminA}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/storage|\\\\|\/home\/|C:/);
  });
});

describe('CP-15 Credenciales almacenadas (NFR-SEG-2)', () => {
  test('las contraseñas se guardan como hash bcrypt y no en texto plano', async () => {
    const { rows } = await pool.query("SELECT password_hash FROM usuario WHERE nombre_usuario = 'ep_admin_a'");
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
    expect(rows[0].password_hash.split('$')[2]).toBe(String(config.bcryptRounds).padStart(2, '0'));
  });
});

describe('CP-17 Aislamiento entre empresas (RB-2, NFR-SEG-4)', () => {
  test('el administrador de B no puede leer, modificar ni borrar datos de A (404)', async () => {
    const h = { Authorization: `Bearer ${adminB}` };
    const lista = await request(app).get(`/api/empresas/${empresaA}/clientes`).set(h);
    const ver = await request(app).put(`/api/empresas/${empresaA}/clientes/${clienteA}`).set(h).send({ nombre: 'Robado' });
    const borra = await request(app).delete(`/api/empresas/${empresaA}/clientes/${clienteA}`).set(h).send({ confirmar: true });
    const contratos = await request(app).get(`/api/empresas/${empresaA}/clientes/${clienteA}/contratos`).set(h);
    const docs = await request(app).get(`/api/empresas/${empresaA}/contratos/${contratoA}/documentos`).set(h);
    const descarga = await request(app).get(`/api/empresas/${empresaA}/documentos/${documentoA}/descargar`).set(h);
    const enlace = await request(app).post(`/api/empresas/${empresaA}/documentos/${documentoA}/enlaces`).set(h).send({});
    for (const r of [lista, ver, borra, contratos, docs, descarga, enlace]) {
      expect(r.status).toBe(404);
    }
    const { rows } = await pool.query('SELECT nombre FROM cliente WHERE id = $1', [clienteA]);
    expect(rows[0].nombre).toBe('Cliente A');
  });
});
