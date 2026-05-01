// src/app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino-http');
const prisma = require('./lib/prisma');

const app = express();

// =========================
// 🔐 SEGURIDAD BASE (ajustada para compatibilidad)
// =========================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // ← Permite recursos cruzados
  crossOriginOpenerPolicy: { policy: "unsafe-none" }     // ← Más permisivo
}));

// =========================
// 🌐 CORS COMPLETO (para todos los navegadores)
// =========================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://sgi.somossoluciones12k.com',
  'https://system-admin-4u3h.onrender.com'
];

// Configuración CORS mejorada
const corsOptions = {
  origin: function (origin, callback) {
    // Permite requests sin origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    // Para desarrollo, permitir cualquier localhost
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    
    // Verificar orígenes permitidos
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS bloqueado: ${origin}`);
    return callback(new Error('CORS no permitido: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  credentials: true,
  optionsSuccessStatus: 200, // ← Importante para navegadores viejos
  maxAge: 86400 // 24 horas de cache para preflight
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));

// Manejar explícitamente las preflight requests (OPTIONS)
app.options('/(.*)', cors(corsOptions));

// =========================
// 📊 LOGGING
// =========================
app.use(pino({
  redact: ['req.headers.authorization'],
  customLogLevel: function(res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
    if (res.statusCode >= 500 || err) return 'error';
    return 'info';
  }
}));

// =========================
// 🚫 RATE LIMIT GLOBAL (más generoso)
// =========================
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // ← aumentado a 200
  message: "Demasiadas solicitudes, intenta más tarde",
  skipSuccessfulRequests: true // ← No contar respuestas exitosas
}));

// =========================
// 🔐 RATE LIMIT LOGIN
// =========================
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10, // ← aumentado a 10
  message: "Demasiados intentos de login",
  skipSuccessfulRequests: true
});

app.use('/api/auth/login', loginLimiter);

// =========================
// 📦 BODY PARSER (con límite aumentado)
// =========================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =========================
// 🛣️ RUTAS CENTRALIZADAS
// =========================
app.use('/api/v1', require('./routes'));

// Mantener compatibilidad con /api (redirección para no romper frontend viejo)
app.use('/api', (req, res, next) => {
  // Redirigir/reescribir /api/* a /api/v1/*
  req.url = req.url.replace(/^\/api/, '/api/v1');
  next();
}, require('./routes'));

// =========================
// 🧪 MIDDLEWARE PARA DEBUG (solo en desarrollo)
// =========================
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url} - Origin: ${req.headers.origin}`);
    next();
  });
}

// =========================
// ❤️ HEALTH CHECK (mejorado)
// =========================
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      db: 'connected',
      timestamp: new Date().toISOString(),
      cors: allowedOrigins
    });
  } catch (error) {
    console.error('DB ERROR:', error);
    res.status(500).json({
      status: 'error',
      env: process.env.NODE_ENV,
      db: 'disconnected',
      error: error.message
    });
  }
});

// =========================
// ❌ 404 HANDLER
// =========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada",
    path: req.url,
    method: req.method
  });
});

// =========================
// ❌ ERROR HANDLER GLOBAL
// =========================
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  
  // Errores de CORS específicos
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: err.message,
      type: 'CORS_ERROR'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Error interno del servidor",
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
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
