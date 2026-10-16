const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const config = require('../config');
const { pool, withTransaction } = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { registrarAuditoria } = require('../utils/audit');
const { unauthorized, conflict } = require('../utils/errors');
const { validatePassword, requireString, requireEmail } = require('../utils/validation');

const router = express.Router();

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('contrasena-ficticia-atlas', config.bcryptRounds);

// POST /api/auth/register  (RF-2.1)
router.post('/register', async (req, res, next) => {
  try {
    const nombreUsuario = requireString(req.body, 'nombre_usuario', { max: 50 });
    const correo = requireEmail(req.body, 'correo');
    validatePassword(req.body.password);

    const hash = await bcrypt.hash(req.body.password, config.bcryptRounds);
    try {
      const { rows } = await pool.query(
        `INSERT INTO usuario (nombre_usuario, correo, password_hash)
         VALUES ($1, $2, $3) RETURNING id, nombre_usuario, correo`,
        [nombreUsuario, correo, hash]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') throw conflict('El nombre de usuario o el correo ya existe');
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  (RF-1.1)
router.post('/login', async (req, res, next) => {
  try {
    const nombreUsuario = requireString(req.body, 'nombre_usuario', { max: 50 });
    const password = requireString(req.body, 'password', { max: 200 });

    const { rows } = await pool.query(
      'SELECT id, nombre_usuario, password_hash, activo FROM usuario WHERE nombre_usuario = $1',
      [nombreUsuario]
    );
    const usuario = rows[0];
    const coincide = await bcrypt.compare(password, usuario ? usuario.password_hash : DUMMY_HASH);
    if (!usuario || !coincide || !usuario.activo) throw unauthorized('Credenciales inválidas');

    const jti = randomUUID();
    const token = jwt.sign(
      { sub: String(usuario.id), nombre_usuario: usuario.nombre_usuario, jti },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: config.jwtExpiresIn }
    );

    await registrarAuditoria(pool, { usuarioId: usuario.id, accion: 'login', entidad: 'usuario', entidadId: usuario.id, ip: req.ip });
    res.json({ token, token_type: 'Bearer', expires_in: config.jwtExpiresIn });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout  (RF-1.2)
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await withTransaction(async (db) => {
      await db.query(
        'INSERT INTO token_revocado (jti, usuario_id, expira_at) VALUES ($1, $2, to_timestamp($3)) ON CONFLICT (jti) DO NOTHING',
        [req.user.jti, req.user.id, req.user.exp]
      );
      await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'logout', entidad: 'usuario', entidadId: req.user.id, ip: req.ip });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
