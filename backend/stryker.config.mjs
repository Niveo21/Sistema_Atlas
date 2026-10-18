// Mutación de código: Stryker altera la lógica y comprueba que las pruebas detecten el cambio.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'jest',
  jest: { configFile: 'jest.stryker.config.js' },
  mutate: ['src/utils/validation.js', 'src/utils/errors.js'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 80, low: 60, break: 60 },
};
