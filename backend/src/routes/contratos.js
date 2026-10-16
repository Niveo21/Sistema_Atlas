const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { requireEmpresaRole } = require('../middleware/empresaAccess');
const { registrarAuditoria } = require('../utils/audit');
const { requireString, positiveInt } = require('../utils/validation');
const { badRequest, notFound } = require('../utils/errors');

// Montado en /api/empresas/:empresaId/clientes/:clienteId/contratos
const router = express.Router({ mergeParams: true });
router.use(authenticate);

// Días antes del término para considerar un contrato "vence".
// El ERS no define este umbral (RF-5.4); queda como decisión del equipo a confirmar.
const DIAS_VENCIMIENTO = 30;

const SQL_ESTADO = `CASE
  WHEN fecha_termino < CURRENT_DATE THEN 'expirado'
  WHEN fecha_termino <= CURRENT_DATE + ($DIAS || ' days')::interval THEN 'vence'
  ELSE 'activo'
END`.replace('$DIAS', String(DIAS_VENCIMIENTO));

// Verifica que el cliente exista, pertenezca a la empresa y no esté eliminado (RB-3).
async function clienteEnEmpresa(clienteId, empresaId) {
  const { rows } = await pool.query(
    'SELECT id FROM cliente WHERE id = $1 AND empresa_id = $2 AND eliminado = FALSE',
    [clienteId, empresaId]
  );
  if (!rows[0]) throw notFound('Cliente no encontrado');
}

// GET /api/empresas/:empresaId/clientes/:clienteId/contratos  (RF-5.1, RF-5.4)
router.get('/', requireEmpresaRole(), async (req, res, next) => {
  try {
    const clienteId = positiveInt(req.params.clienteId, 'clienteId');
    await clienteEnEmpresa(clienteId, req.empresa.id);

    const { rows } = await pool.query(
      `SELECT id, titulo, descripcion, fecha_inicio, fecha_termino, ${SQL_ESTADO} AS estado
       FROM contrato
       WHERE cliente_id = $1 AND eliminado = FALSE
       ORDER BY fecha_inicio DESC`,
      [clienteId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas/:empresaId/clientes/:clienteId/contratos  (RF-5.1, solo administrador)
router.post('/', requireEmpresaRole('administrador'), async (req, res, next) => {
  try {
    const clienteId = positiveInt(req.params.clienteId, 'clienteId');
    await clienteEnEmpresa(clienteId, req.empresa.id);

    const titulo = requireString(req.body, 'titulo', { max: 150 });
    const descripcion = requireString(req.body, 'descripcion', { max: 2000, optional: true });
    const inicio = requireString(req.body, 'fecha_inicio', { max: 10 });
    const termino = requireString(req.body, 'fecha_termino', { max: 10 });

    const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRe.test(inicio) || !fechaRe.test(termino)) throw badRequest('Las fechas deben tener formato AAAA-MM-DD');
    if (termino < inicio) throw badRequest('La fecha de término no puede ser anterior a la de inicio');

    const { rows } = await pool.query(
      `INSERT INTO contrato (cliente_id, titulo, descripcion, fecha_inicio, fecha_termino)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, titulo, descripcion, fecha_inicio, fecha_termino`,
      [clienteId, titulo, descripcion, inicio, termino]
    );
    await registrarAuditoria(pool, {
      empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'crear', entidad: 'contrato', entidadId: rows[0].id, ip: req.ip,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
