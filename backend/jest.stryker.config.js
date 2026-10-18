// Configuración de Jest solo para Stryker: usa las pruebas unitarias que no necesitan base de datos.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/env.js'],
  testMatch: ['<rootDir>/tests/validation.test.js'],
};
