// src/app.js



const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino-http');
const prisma = require('./lib/prisma');

const app = express();

// =========================
// 🔐 SEGURIDAD BASE
// =========================
app.use(helmet());

const allowedOrigins = [
  'http://localhost:5173',
  'https://sgi.somossoluciones12k.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requests sin origin (Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS no permitido: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

// =========================
// 📊 LOGGING
// =========================
app.use(pino({
  redact: ['req.headers.authorization']
}));

// =========================
// 🚫 RATE LIMIT GLOBAL
// =========================
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Demasiadas solicitudes, intenta más tarde"
}));

// =========================
// 🔐 RATE LIMIT LOGIN
// =========================
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos de login"
});

app.use('/api/auth/login', loginLimiter);

// =========================
// 📦 BODY PARSER
// =========================
app.use(express.json());

// =========================
// 🛣️ RUTAS CENTRALIZADAS
// =========================
app.use('/api/v1', require('./routes')); // 🔥 index.js maneja todo


// =========================
// ❤️ HEALTH CHECK
// =========================

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      env: process.env.NODE_ENV,
      db: 'connected'
    });

  } catch (error) {
    console.error('DB ERROR:', error);

    res.status(500).json({
      status: 'error',
      env: process.env.NODE_ENV,
      db: 'disconnected'
    });
  }
});

// =========================
// ❌ 404 HANDLER
// =========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada"
  });
});

// =========================
// ❌ ERROR HANDLER GLOBAL
// =========================
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Error interno del servidor"
  });
});

// =========================
// ⏱️ CRON JOBS
// =========================
require('./jobs/mora.job');

// =========================
// EXPORT
// =========================
module.exports = app;
