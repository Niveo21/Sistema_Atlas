// Aplica el esquema SQL de la carpeta db/ a la base indicada en DATABASE_URL.
// Uso: npm run db:migrate
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const archivo = process.argv[2];
  if (!archivo) throw new Error('Indica el archivo SQL a aplicar');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(fs.readFileSync(archivo, 'utf8'));
  await client.end();
  console.log(`Esquema aplicado: ${archivo}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
