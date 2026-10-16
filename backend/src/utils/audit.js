// Registra una acción crítica en la tabla auditoria (RF-6.1).
// Nunca guardar contraseñas, tokens ni datos bancarios en "detalle".
async function registrarAuditoria(db, { empresaId = null, usuarioId = null, accion, entidad, entidadId = null, detalle = null, ip = null }) {
  await db.query(
    `INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, detalle, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [empresaId, usuarioId, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null, ip]
  );
}

module.exports = { registrarAuditoria };
