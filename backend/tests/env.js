// Variables de entorno para las pruebas. Se pueden sobrescribir con un .env.test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://atlas:atlas@localhost:5432/atlas_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto_de_pruebas_atlas_con_mas_de_32_caracteres';
process.env.BCRYPT_ROUNDS = '4';
process.env.CORS_ORIGIN = 'http://localhost:3000';
