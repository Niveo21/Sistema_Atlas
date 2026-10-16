require('dotenv').config({ quiet: true });

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
};
