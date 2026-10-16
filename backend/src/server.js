const app = require('./app');
const config = require('./config');
const { pool } = require('./db');

const server = app.listen(config.port, () => {
  console.log(`Atlas API escuchando en el puerto ${config.port}`);
});

function apagar() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
