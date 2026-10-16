const request = require('supertest');
const fs = require('fs');
const app = require('../src/app');
const config = require('../src/config');
const { pool } = require('../src/db');

const PASSWORD = 'Clave-Segura-2026';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

async function registrar(nombreUsuario) {
  await request(app).post('/api/auth/register').send({
    nombre_usuario: nombreUsuario, correo: `${nombreUsuario}@atlas.test`, password: PASSWORD,
  });
  const res = await request(app).post('/api/auth/login').send({ nombre_usuario: nombreUsuario, password: PASSWORD });
  return res.body.token;
}

let admin;
let editor;
let externo;
let empresaId;
let contratoId;
let documentoId;

beforeAll(async () => {
  await pool.query('TRUNCATE auditoria, token_revocado, enlace_compartido, documento, contrato, cliente, empresa_usuarios, empresa, usuario RESTART IDENTITY CASCADE');
  admin = await registrar('admin_docs');
  editor = await registrar('editor_docs');
  externo = await registrar('externo_docs');

  const emp = await request(app).post('/api/empresas').set('Authorization', `Bearer ${admin}`).send({
    nombre: 'Empresa Docs', direccion: 'Calle 1', telefono: '+56 2 1111 1111', correo: 'docs@empresa.test',
  });
  empresaId = emp.body.id;
  await request(app).post(`/api/empresas/${empresaId}/usuarios`).set('Authorization', `Bearer ${admin}`)
    .send({ nombre_usuario: 'editor_docs', rol: 'editor' });

  const cli = await request(app).post(`/api/empresas/${empresaId}/clientes`).set('Authorization', `Bearer ${admin}`)
    .send({ nombre: 'Cliente Docs' });
  const con = await request(app).post(`/api/empresas/${empresaId}/clientes/${cli.body.id}/contratos`)
    .set('Authorization', `Bearer ${admin}`).send({ titulo: 'Contrato Docs', fecha_inicio: '2026-01-01', fecha_termino: '2030-01-01' });
  contratoId = con.body.id;
});

afterAll(async () => {
  fs.rmSync(config.storageDir, { recursive: true, force: true });
  await pool.end();
});

describe('Subida de documentos (RF-5.2, RF-5.3)', () => {
  test('el administrador sube un PDF válido y la ruta interna no se expone', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${admin}`)
      .attach('archivo', PDF, { filename: 'contrato.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.sha256).toHaveLength(64);
    expect(res.body).not.toHaveProperty('ruta_storage');
    documentoId = res.body.id;
  });

  test('rechaza un archivo cuyo contenido no corresponde a su tipo', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${admin}`)
      .attach('archivo', Buffer.from('esto no es un pdf'), { filename: 'falso.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  test('rechaza tipos de archivo no permitidos', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${admin}`)
      .attach('archivo', Buffer.from('<html></html>'), { filename: 'pagina.html', contentType: 'text/html' });
    expect(res.status).toBe(400);
  });

  test('rechaza archivos que superan el tamaño máximo (413)', async () => {
    const grande = Buffer.concat([PDF, Buffer.alloc(config.maxUploadBytes + 10, 0x20)]);
    const res = await request(app).post(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${admin}`)
      .attach('archivo', grande, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  test('el editor no puede subir documentos (403)', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${editor}`)
      .attach('archivo', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(403);
  });
});

describe('Descarga y listado (RB-2, RB-4)', () => {
  test('el editor lista y descarga el documento con su contenido original', async () => {
    const lista = await request(app).get(`/api/empresas/${empresaId}/contratos/${contratoId}/documentos`)
      .set('Authorization', `Bearer ${editor}`);
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(1);

    const res = await request(app).get(`/api/empresas/${empresaId}/documentos/${documentoId}/descargar`)
      .set('Authorization', `Bearer ${editor}`).buffer(true).parse((r, cb) => {
        const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(res.body, PDF)).toBe(0);
  });

  test('un usuario fuera de la empresa no accede al documento (404)', async () => {
    const res = await request(app).get(`/api/empresas/${empresaId}/documentos/${documentoId}/descargar`)
      .set('Authorization', `Bearer ${externo}`);
    expect(res.status).toBe(404);
  });
});

describe('Enlaces para compartir (RF-5.5)', () => {
  let token;
  let enlaceId;

  const descargarPublico = (t) => request(app).get(`/api/enlaces/${t}`).buffer(true).parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  test('el administrador crea un enlace y cualquiera con el enlace descarga el documento', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/documentos/${documentoId}/enlaces`)
      .set('Authorization', `Bearer ${admin}`).send({ horas: 24 });
    expect(res.status).toBe(201);
    token = res.body.ruta.split('/').pop();
    enlaceId = res.body.id;
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const pub = await descargarPublico(token);
    expect(pub.status).toBe(200);
    expect(Buffer.compare(pub.body, PDF)).toBe(0);
  });

  test('en la base solo se guarda el hash del token', async () => {
    const { rows } = await pool.query('SELECT token FROM enlace_compartido WHERE id = $1', [enlaceId]);
    expect(rows[0].token).not.toBe(token);
    expect(rows[0].token).toHaveLength(64);
  });

  test('un token con formato inválido o inexistente responde 404', async () => {
    expect((await descargarPublico('no-es-un-token')).status).toBe(404);
    expect((await descargarPublico('0'.repeat(64))).status).toBe(404);
  });

  test('un enlace revocado deja de funcionar', async () => {
    const del = await request(app).delete(`/api/empresas/${empresaId}/enlaces/${enlaceId}`).set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(204);
    expect((await descargarPublico(token)).status).toBe(404);
  });

  test('un enlace vencido deja de funcionar', async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/documentos/${documentoId}/enlaces`)
      .set('Authorization', `Bearer ${admin}`).send({ horas: 1 });
    const vencido = res.body.ruta.split('/').pop();
    await pool.query("UPDATE enlace_compartido SET expira_at = now() - interval '1 minute' WHERE id = $1", [res.body.id]);
    expect((await descargarPublico(vencido)).status).toBe(404);
  });

  test('el editor no puede crear enlaces (403) ni vigencias mayores al máximo (400)', async () => {
    const porEditor = await request(app).post(`/api/empresas/${empresaId}/documentos/${documentoId}/enlaces`)
      .set('Authorization', `Bearer ${editor}`).send({ horas: 1 });
    expect(porEditor.status).toBe(403);

    const muyLargo = await request(app).post(`/api/empresas/${empresaId}/documentos/${documentoId}/enlaces`)
      .set('Authorization', `Bearer ${admin}`).send({ horas: 500 });
    expect(muyLargo.status).toBe(400);
  });
});

describe('Auditoría de documentos (RF-6.1)', () => {
  test('la subida, la descarga y el enlace quedan registrados', async () => {
    const { rows } = await pool.query(
      "SELECT DISTINCT accion FROM auditoria WHERE empresa_id = $1 AND accion IN ('subir_documento','descargar_documento','compartir_documento')",
      [empresaId]
    );
    expect(rows.map((r) => r.accion).sort()).toEqual(['compartir_documento', 'descargar_documento', 'subir_documento']);
  });
});
