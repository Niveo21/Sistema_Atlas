const { pool } = require('../db');
const { notFound, forbidden } = require('../utils/errors');
const { positiveInt } = require('../utils/validation');

// Exige que el usuario pertenezca a la empresa de la ruta (RB-2) y, opcionalmente,
// que tenga uno de los roles indicados (RB-4, RB-5).
// Para usuarios no miembros responde 404 para no revelar si la empresa existe.
function requireEmpresaRole(...rolesPermitidos) {
  return async (req, res, next) => {
    try {
      const empresaId = positiveInt(req.params.empresaId, 'empresaId');
      const result = await pool.query(
        'SELECT rol FROM empresa_usuarios WHERE empresa_id = $1 AND usuario_id = $2',
        [empresaId, req.user.id]
      );
      if (result.rowCount === 0) throw notFound('Empresa no encontrada');

      const rol = result.rows[0].rol;
      if (rolesPermitidos.length && !rolesPermitidos.includes(rol)) throw forbidden();

      req.empresa = { id: empresaId, rol };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireEmpresaRole };
