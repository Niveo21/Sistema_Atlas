const express = require('express');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const config = require('../config');
const { pool, withTransaction } = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { requireEmpresaRole } = require('../middleware/empresaAccess');
const { registrarAuditoria } = require('../utils/audit');
const { AppError, badRequest, notFound } = require('../utils/errors');
const { positiveInt } = require('../utils/validation');
const { validarArchivo, nombreSeguro, guardarArchivo, rutaAbsoluta, sha256 } = require('../utils/archivos');

// Subida en memoria con límite de tamaño y un solo archivo por petición.
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
}).single('archivo');

function subidaConErrores(req, res, next) {
  subida(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, `El archivo supera el máximo de ${config.maxUploadBytes / 1024 / 1024} MB`));
    }
    return next(badRequest('No se pudo procesar la subida del archivo'));
  });
}

// Consulta un documento solo si pertenece a la empresa indicada (RB-2).
async function documentoDeEmpresa(documentoId, empresaId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.contrato_id, d.nombre_original, d.tipo_mime, d.tamano_bytes, d.ruta_storage, d.sha256, d.created_at
     FROM documento d
     JOIN contrato c ON c.id = d.contrato_id
     JOIN cliente cl ON cl.id = c.cliente_id
     WHERE d.id = $1 AND cl.empresa_id = $2 AND cl.eliminado = FALSE AND c.eliminado = FALSE`,
    [documentoId, empresaId]
  );
  if (!rows[0]) throw notFound('Documento no encontrado');
  return rows[0];
}

// Envía el archivo como descarga, sin exponer la ruta interna.
function enviarArchivo(res, doc) {
  const ruta = rutaAbsoluta(doc.ruta_storage);
  res.setHeader('Content-Type', doc.tipo_mime);
  res.setHeader('Content-Length', doc.tamano_bytes);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombre_original)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(ruta)
    .on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Archivo no disponible' });
      else res.destroy();
    })
    .pipe(res);
}

const empresaDocumentosRouter = express.Router();

// GET /api/empresas/:empresaId/contratos/:contratoId/documentos  (RF-5.2)
empresaDocumentosRouter.get(
  '/:empresaId/contratos/:contratoId/documentos',
  authenticate,
  requireEmpresaRole(),
  async (req, res, next) => {
    try {
      const contratoId = positiveInt(req.params.contratoId, 'contratoId');
      const { rows } = await pool.query(
        `SELECT d.id, d.nombre_original, d.tipo_mime, d.tamano_bytes, d.sha256, d.created_at
         FROM documento d
         JOIN contrato c ON c.id = d.contrato_id
         JOIN cliente cl ON cl.id = c.cliente_id
         WHERE d.contrato_id = $1 AND cl.empresa_id = $2 AND cl.eliminado = FALSE AND c.eliminado = FALSE
         ORDER BY d.created_at DESC`,
        [contratoId, req.empresa.id]
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/empresas/:empresaId/contratos/:contratoId/documentos  (RF-5.2, RF-5.3, solo administrador)
// Campo multipart: "archivo".
empresaDocumentosRouter.post(
  '/:empresaId/contratos/:contratoId/documentos',
  authenticate,
  requireEmpresaRole('administrador'),
  subidaConErrores,
  async (req, res, next) => {
    let rutaGuardada = null;
    try {
      const contratoId = positiveInt(req.params.contratoId, 'contratoId');
      validarArchivo(req.file);

      const { rows: contratos } = await pool.query(
        `SELECT c.id FROM contrato c JOIN cliente cl ON cl.id = c.cliente_id
         WHERE c.id = $1 AND cl.empresa_id = $2 AND c.eliminado = FALSE AND cl.eliminado = FALSE`,
        [contratoId, req.empresa.id]
      );
      if (!contratos[0]) throw notFound('Contrato no encontrado');

      const archivo = req.file;
      rutaGuardada = await guardarArchivo(archivo.buffer, archivo.mimetype);

      const doc = await withTransaction(async (db) => {
        const { rows } = await db.query(
          `INSERT INTO documento (contrato_id, nombre_original, tipo_mime, tamano_bytes, ruta_storage, sha256, subido_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, nombre_original, tipo_mime, tamano_bytes, sha256, created_at`,
          [contratoId, nombreSeguro(archivo.originalname), archivo.mimetype, archivo.size, rutaGuardada, sha256(archivo.buffer), req.user.id]
        );
        await registrarAuditoria(db, {
          empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'subir_documento', entidad: 'documento',
          entidadId: rows[0].id, detalle: { tipo_mime: archivo.mimetype, tamano_bytes: archivo.size }, ip: req.ip,
        });
        return rows[0];
      });
      res.status(201).json(doc);
    } catch (err) {
      // Si la base de datos falla después de guardar el archivo, se elimina para no dejar huérfanos.
      if (rutaGuardada) await fs.promises.unlink(rutaAbsoluta(rutaGuardada)).catch(() => {});
      next(err);
    }
  }
);

// GET /api/empresas/:empresaId/documentos/:documentoId/descargar  (RF-5.2)
empresaDocumentosRouter.get(
  '/:empresaId/documentos/:documentoId/descargar',
  authenticate,
  requireEmpresaRole(),
  async (req, res, next) => {
    try {
      const documentoId = positiveInt(req.params.documentoId, 'documentoId');
      const doc = await documentoDeEmpresa(documentoId, req.empresa.id);
      await registrarAuditoria(pool, {
        empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'descargar_documento', entidad: 'documento',
        entidadId: doc.id, ip: req.ip,
      });
      enviarArchivo(res, doc);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/empresas/:empresaId/documentos/:documentoId/enlaces  (RF-5.5, solo administrador)
// Body opcional: { "horas": 24 }. El token se devuelve una sola vez; en la base solo queda su hash.
empresaDocumentosRouter.post(
  '/:empresaId/documentos/:documentoId/enlaces',
  authenticate,
  requireEmpresaRole('administrador'),
  async (req, res, next) => {
    try {
      const documentoId = positiveInt(req.params.documentoId, 'documentoId');
      await documentoDeEmpresa(documentoId, req.empresa.id);

      const horas = req.body?.horas === undefined ? 24 : positiveInt(req.body.horas, 'horas');
      if (horas > config.maxEnlaceHoras) throw badRequest(`La vigencia máxima es ${config.maxEnlaceHoras} horas`);

      const token = crypto.randomBytes(32).toString('hex');
      const hash = sha256(Buffer.from(token));

      const enlace = await withTransaction(async (db) => {
        const { rows } = await db.query(
          `INSERT INTO enlace_compartido (documento_id, token, expira_at, creado_por)
           VALUES ($1, $2, now() + make_interval(hours => $3::int), $4)
           RETURNING id, expira_at`,
          [documentoId, hash, horas, req.user.id]
        );
        await registrarAuditoria(db, {
          empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'compartir_documento', entidad: 'documento',
          entidadId: documentoId, detalle: { enlace_id: rows[0].id, horas }, ip: req.ip,
        });
        return rows[0];
      });
      res.status(201).json({ id: enlace.id, expira_at: enlace.expira_at, ruta: `/api/enlaces/${token}` });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/empresas/:empresaId/enlaces/:enlaceId  (RF-5.5, solo administrador)
empresaDocumentosRouter.delete(
  '/:empresaId/enlaces/:enlaceId',
  authenticate,
  requireEmpresaRole('administrador'),
  async (req, res, next) => {
    try {
      const enlaceId = positiveInt(req.params.enlaceId, 'enlaceId');
      const { rowCount } = await pool.query(
        `UPDATE enlace_compartido SET revocado = TRUE
         WHERE id = $1 AND documento_id IN (
           SELECT d.id FROM documento d
           JOIN contrato c ON c.id = d.contrato_id
           JOIN cliente cl ON cl.id = c.cliente_id
           WHERE cl.empresa_id = $2)`,
        [enlaceId, req.empresa.id]
      );
      if (rowCount === 0) throw notFound('Enlace no encontrado');
      await registrarAuditoria(pool, {
        empresaId: req.empresa.id, usuarioId: req.user.id, accion: 'compartir_documento', entidad: 'enlace_compartido',
        entidadId: enlaceId, detalle: { revocado: true }, ip: req.ip,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

// Ruta pública: GET /api/enlaces/:token  (RF-5.5)
// Sin autenticación: el token de 256 bits es la credencial. Responde 404 si no existe, está revocado o venció.
const enlacesPublicRouter = express.Router();

enlacesPublicRouter.get('/:token', async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) throw notFound('Enlace no válido o vencido');
    const hash = sha256(Buffer.from(req.params.token));

    const { rows } = await pool.query(
      `SELECT e.id AS enlace_id, d.id, d.nombre_original, d.tipo_mime, d.tamano_bytes, d.ruta_storage, d.sha256, d.created_at,
              cl.empresa_id
       FROM enlace_compartido e
       JOIN documento d ON d.id = e.documento_id
       JOIN contrato c ON c.id = d.contrato_id
       JOIN cliente cl ON cl.id = c.cliente_id
       WHERE e.token = $1 AND e.revocado = FALSE AND e.expira_at > now()
         AND cl.eliminado = FALSE AND c.eliminado = FALSE`,
      [hash]
    );
    if (!rows[0]) throw notFound('Enlace no válido o vencido');

    await registrarAuditoria(pool, {
      empresaId: rows[0].empresa_id, accion: 'descargar_documento', entidad: 'documento', entidadId: rows[0].id,
      detalle: { via: 'enlace', enlace_id: rows[0].enlace_id }, ip: req.ip,
    });
    enviarArchivo(res, rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = { empresaDocumentosRouter, enlacesPublicRouter };
