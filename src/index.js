const express = require('express');
const path = require('path');
require('dotenv').config();

const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// CORS (opcional, descomenta si lo necesitas)
// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//   next();
// });

// Rutas
app.use('/api', reportRoutes);

// Ruta raíz para verificación rápida
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenido al Generador de Reportes de Distritos',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      generateReport: 'POST /api/report',
      downloadReportPdf: 'POST /api/report/pdf',
      generateRegionalReport: 'POST /api/regional-report',
    },
    example: {
      method: 'POST',
      url: '/api/report',
      body: {
        district_name: 'D-11',
        d1: '2026-04-13',
        d2: '2026-04-19',
      },
    },
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message,
  });
});

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Generador de Reportes - Activo      ║
║   Puerto: ${PORT}                          ║
║   Host: ${HOST}                         ║
║   Entorno: ${process.env.NODE_ENV || 'development'}             ║
╚════════════════════════════════════════╝

Endpoints disponibles:
  GET  /                 → Información del servidor
  GET  /api/health       → Health check
  POST /api/report       → Generar reporte

Ejemplo de uso:
  curl -X POST http://localhost:${PORT}/api/report \\
    -H "Content-Type: application/json" \\
    -d '{"district_name": "D-11", "d1": "2026-04-13", "d2": "2026-04-19"}'
  `);
});

module.exports = app;
