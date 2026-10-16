const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { unauthorized } = require('../utils/errors');

// Verifica el JWT y que no haya sido revocado en logout (RF-1.1, RF-1.2, NFR-SEG-9).
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw unauthorized('Token inválido o vencido');
    }

    const revoked = await pool.query('SELECT 1 FROM token_revocado WHERE jti = $1', [payload.jti]);
    if (revoked.rowCount > 0) throw unauthorized('La sesión fue cerrada');

    req.user = { id: Number(payload.sub), nombreUsuario: payload.nombre_usuario, jti: payload.jti, exp: payload.exp };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
