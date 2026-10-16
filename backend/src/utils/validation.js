const { badRequest } = require('./errors');

// Política de contraseñas del ERS (sección 2.4): mínimo 12 caracteres con
// mayúscula, minúscula, número y símbolo.
function validatePassword(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 12) errors.push('Mínimo 12 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Debe incluir una mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Debe incluir una minúscula');
  if (!/[0-9]/.test(password)) errors.push('Debe incluir un número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Debe incluir un símbolo');
  if (errors.length) throw badRequest('Contraseña no cumple la política', errors);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireString(body, field, { max = 255, optional = false } = {}) {
  const value = body[field];
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`El campo ${field} es obligatorio`);
  }
  if (typeof value !== 'string' || value.length > max) {
    throw badRequest(`El campo ${field} no es válido (máximo ${max} caracteres)`);
  }
  return value.trim();
}

function requireEmail(body, field) {
  const value = requireString(body, field, { max: 254 });
  if (!EMAIL_RE.test(value)) throw badRequest(`El campo ${field} no tiene formato de correo`);
  return value.toLowerCase();
}

function positiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${name} debe ser un entero positivo`);
  return n;
}

module.exports = { validatePassword, requireString, requireEmail, positiveInt };
