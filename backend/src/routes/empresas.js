const express = require('express');
const { pool, withTransaction } = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { requireEmpresaRole } = require('../middleware/empresaAccess');
const { registrarAuditoria } = require('../utils/audit');
const { requireString, requireEmail, positiveInt } = require('../utils/validation');
const { badRequest, notFound } = require('../utils/errors');

const router = express.Router();
router.use(authenticate);

// POST /api/empresas  (RF-2.2, RF-2.3)
// Quien crea la empresa queda como administrador.
router.post('/', async (req, res, next) => {
  try {
    const nombre = requireString(req.body, 'nombre', { max: 150 });
    const direccion = requireString(req.body, 'direccion', { max: 255 });
    const telefono = requireString(req.body, 'telefono', { max: 30 });
    const correo = requireEmail(req.body, 'correo');

    const empresa = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO empresa (nombre, direccion, telefono, correo)
         VALUES ($1, $2, $3, $4) RETURNING id, nombre, direccion, telefono, correo`,
        [nombre, direccion, telefono, correo]
      );
      await db.query(
        `INSERT INTO empresa_usuarios (empresa_id, usuario_id, rol) VALUES ($1, $2, 'administrador')`,
        [rows[0].id, req.user.id]
      );
      await registrarAuditoria(db, { empresaId: rows[0].id, usuarioId: req.user.id, accion: 'crear', entidad: 'empresa', entidadId: rows[0].id, ip: req.ip });
      return rows[0];
    });
    res.status(201).json(empresa);
  } catch (err) {
    if (err.code === '23505') return next(badRequest('El correo de la empresa ya está registrado'));
    next(err);
  }
});

// GET /api/empresas  (empresas del usuario autenticado)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.nombre, eu.rol
       FROM empresa_usuarios eu JOIN empresa e ON e.id = eu.empresa_id
       WHERE eu.usuario_id = $1 ORDER BY e.nombre`,
      [req.user.id]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas/:empresaId/usuarios  (RF-3.1)
// Asigna un rol a un usuario ya registrado. La invitación por correo queda pendiente.
router.post('/:empresaId/usuarios', requireEmpresaRole('administrador'), async (req, res, next) => {
  try {
    const nombreUsuario = requireString(req.body, 'nombre_usuario', { max: 50 });
    const rol = requireString(req.body, 'rol', { max: 20 });
    if (!['administrador', 'editor'].includes(rol)) throw badRequest('El rol debe ser administrador o editor');

    const { rows } = await pool.query('SELECT id FROM usuario WHERE nombre_usuario = $1', [nombreUsuario]);
    if (!rows[0]) throw notFound('Usuario no encontrado');

    await withTransaction(async (db) => {
      await db.query(
        `INSERT INTO empresa_usuarios (empresa_id, usuario_id, rol) VALUES ($1, $2, $3)
         ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol`,
        [req.empresa.id, rows[0].id, rol]
      );
      await registrarAuditoria(db, {
        empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'cambio_rol',
        entidad: 'usuario', entidadId: rows[0].id, detalle: { rol }, ip: req.ip,
      });
    });
    res.status(201).json({ usuario_id: rows[0].id, rol });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
