// src/server.js

require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 8000;

// =========================
// 🚀 START SERVER
// =========================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📦 Base de datos: ${process.env.DATABASE_URL?.replace(/:.+@/, ':****@')}`); // Debug
});

// =========================
// 🔥 MANEJO DE ERRORES GLOBALES
// =========================
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});