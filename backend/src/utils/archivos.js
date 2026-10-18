const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { badRequest } = require('./errors');

// Tipos permitidos (RF-5.2) con su extensión de almacenamiento y la firma binaria esperada.
const OLE = (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const ZIP = (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

const TIPOS = {
  'application/pdf': { ext: '.pdf', firma: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  'application/msword': { ext: '.doc', firma: OLE },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', firma: ZIP },
  'application/vnd.ms-powerpoint': { ext: '.ppt', firma: OLE },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', firma: ZIP },
  'image/jpeg': { ext: '.jpg', firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

// Valida el tipo declarado y que el contenido coincida con la firma del formato.
function validarArchivo(file) {
  if (!file) throw badRequest('Debes adjuntar un archivo en el campo "archivo"');
  const tipo = TIPOS[file.mimetype];
  if (!tipo) throw badRequest('Tipo de archivo no permitido (PDF, DOC, DOCX, PPT, PPTX, JPG o PNG)');
  if (!tipo.firma(file.buffer)) throw badRequest('El contenido del archivo no corresponde a su tipo');
  return tipo;
}

// Nombre original sin rutas ni caracteres de control.
function nombreSeguro(nombre) {
  const base = path.basename(String(nombre || 'archivo'));
  // Intencional: se quitan los caracteres de control, incluido el nulo (\u0000).
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'archivo';
}

// Guarda el archivo con un nombre aleatorio y devuelve la ruta relativa (nunca expuesta al cliente).
async function guardarArchivo(buffer, mimetype) {
  const tipo = TIPOS[mimetype];
  const carpeta = String(new Date().getUTCFullYear());
  const relativa = path.join(carpeta, crypto.randomUUID() + tipo.ext);
  const absoluta = path.join(config.storageDir, relativa);
  await fs.promises.mkdir(path.dirname(absoluta), { recursive: true });
  await fs.promises.writeFile(absoluta, buffer, { flag: 'wx' });
  return relativa;
}

function rutaAbsoluta(rutaRelativa) {
  const absoluta = path.resolve(config.storageDir, rutaRelativa);
  // Defensa adicional: nunca salir de la carpeta de almacenamiento.
  if (!absoluta.startsWith(path.resolve(config.storageDir) + path.sep)) throw new Error('Ruta de almacenamiento inválida');
  return absoluta;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { validarArchivo, nombreSeguro, guardarArchivo, rutaAbsoluta, sha256, TIPOS };
