const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { requireEmpresaRole } = require('../middleware/empresaAccess');
const { registrarAuditoria } = require('../utils/audit');
const { requireString, positiveInt } = require('../utils/validation');
const { badRequest, notFound } = require('../utils/errors');

// Montado en /api/empresas/:empresaId/clientes
const router = express.Router({ mergeParams: true });
router.use(authenticate);

const MAX_PAGE_SIZE = 100;

// Campos editables (RF-4.1). Se ignoran cualquier otro campo del body.
function camposCliente(body, { parcial = false } = {}) {
  const campos = {};
  const definiciones = {
    nombre: { max: 150, optional: false },
    descripcion: { max: 2000, optional: true },
    direccion: { max: 255, optional: true },
    contacto: { max: 150, optional: true },
  };
  for (const [campo, opts] of Object.entries(definiciones)) {
    if (parcial && body[campo] === undefined) continue;
    campos[campo] = requireString(body, campo, { max: opts.max, optional: opts.optional });
  }
  return campos;
}

// GET /api/empresas/:empresaId/clientes?page=1&limit=20&q=texto  (RF-4.2)
// Cualquier miembro puede listar (RB-4: el editor solo lee).
router.get('/', requireEmpresaRole(), async (req, res, next) => {
  try {
    const page = req.query.page ? positiveInt(req.query.page, 'page') : 1;
    const limit = Math.min(req.query.limit ? positiveInt(req.query.limit, 'limit') : 20, MAX_PAGE_SIZE);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    const filtro = 'WHERE empresa_id = $1 AND eliminado = FALSE AND nombre ILIKE $2';
    const [{ rows }, conteo] = await Promise.all([
      pool.query(
        `SELECT id, nombre, descripcion, direccion, contacto, created_at, updated_at
         FROM cliente ${filtro}
         ORDER BY nombre
         LIMIT $3 OFFSET $4`,
        [req.empresa.id, patron, limit, (page - 1) * limit]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM cliente ${filtro}`, [req.empresa.id, patron]),
    ]);
    const total = conteo.rows[0].total;
    res.json({ data: rows, page, limit, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas/:empresaId/clientes  (RF-4.1, solo administrador)
router.post('/', requireEmpresaRole('administrador'), async (req, res, next) => {
  try {
    const c = camposCliente(req.body);
    const { rows } = await pool.query(
      `INSERT INTO cliente (empresa_id, nombre, descripcion, direccion, contacto)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, descripcion, direccion, contacto, created_at, updated_at`,
      [req.empresa.id, c.nombre, c.descripcion ?? null, c.direccion ?? null, c.contacto ?? null]
    );
    await registrarAuditoria(pool, {
      empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'crear', entidad: 'cliente', entidadId: rows[0].id, ip: req.ip,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/empresas/:empresaId/clientes/:id  (RF-4.2, solo administrador)
router.put('/:id', requireEmpresaRole('administrador'), async (req, res, next) => {
  try {
    const id = positiveInt(req.params.id, 'id');
    const c = camposCliente(req.body, { parcial: true });
    if (Object.keys(c).length === 0) throw badRequest('No hay campos para actualizar');

    const sets = Object.keys(c).map((campo, i) => `${campo} = $${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE cliente SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND empresa_id = $2 AND eliminado = FALSE
       RETURNING id, nombre, descripcion, direccion, contacto, created_at, updated_at`,
      [id, req.empresa.id, ...Object.values(c)]
    );
    if (!rows[0]) throw notFound('Cliente no encontrado');

    await registrarAuditoria(pool, {
      empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'editar', entidad: 'cliente', entidadId: id,
      detalle: { campos: Object.keys(c) }, ip: req.ip,
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/empresas/:empresaId/clientes/:id  (RF-4.3, solo administrador)
// Eliminación lógica. Exige confirmación explícita en el body: { "confirmar": true }.
router.delete('/:id', requireEmpresaRole('administrador'), async (req, res, next) => {
  try {
    if (req.body?.confirmar !== true) throw badRequest('Debe confirmar la eliminación con { "confirmar": true }');
    const id = positiveInt(req.params.id, 'id');

    const { rowCount } = await pool.query(
      `UPDATE cliente SET eliminado = TRUE, updated_at = now()
       WHERE id = $1 AND empresa_id = $2 AND eliminado = FALSE`,
      [id, req.empresa.id]
    );
    if (rowCount === 0) throw notFound('Cliente no encontrado');

    await registrarAuditoria(pool, {
      empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'eliminar', entidad: 'cliente', entidadId: id, ip: req.ip,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
