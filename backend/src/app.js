const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const clientesRoutes = require('./routes/clientes');
const contratosRoutes = require('./routes/contratos');
const { empresaDocumentosRouter, enlacesPublicRouter } = require('./routes/documentos');
const { AppError } = require('./utils/errors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: false }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/empresas/:empresaId/clientes', clientesRoutes);
app.use('/api/empresas/:empresaId/clientes/:clienteId/contratos', contratosRoutes);
app.use('/api/empresas', empresaDocumentosRouter);
app.use('/api/enlaces', enlacesPublicRouter);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejo central de errores: nunca se devuelven stacks ni detalles internos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }
  console.error('Error no controlado:', err.code || err.name);
  return res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
