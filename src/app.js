// src/app.js
// ============================================================
//  SGI Backend — Production-ready Express App
//  Sirtech Security / Soluciones 12K
// ============================================================

'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const pinoHttp   = require('pino-http');
const hpp        = require('hpp');                 // HTTP Parameter Pollution
const mongoSanitize = require('express-mongo-sanitize'); // NoSQL injection
const prisma     = require('./lib/prisma');
const rateLimit = require('express-rate-limit');
const app = express();

// ============================================================
// 🌐  TRUST PROXY  (Nginx / Render / Railway / etc.)
// ============================================================
// Sin esto, express-rate-limit usa la IP del proxy, no la real.
app.set('trust proxy', 1);

// ============================================================
// 🔒  CORS  — va PRIMERO, antes de Helmet
// ============================================================
const allowedOrigins = [
  'http://localhost:5173',
  'https://sgi.somossoluciones12k.com',
];

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('CORS no permitido'), { status: 403 }));
  },
  methods : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders : [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
  ],
  exposedHeaders : ['X-Request-ID', 'RateLimit-Remaining'],
  credentials    : true,
  maxAge         : 86400, // preflight cache: 24 h (reduce OPTIONS requests)
};

app.use(cors(corsOptions));

// ✅ Responde explícitamente a TODOS los preflight ANTES del rate-limit
// Chrome/Edge requieren OPTIONS exitoso antes de cualquier request con credenciales
app.options('/{*any}', cors(corsOptions));

// ============================================================
// 🛡️  HELMET — después de CORS, con políticas cross-origin relajadas
// ============================================================
app.use(
  helmet({
    // ✅ Permite que el frontend en otro origen consuma la API
    crossOriginResourcePolicy  : { policy: 'cross-origin' },

    // ❌ Desactiva COOP: evita romper OAuth popups / redirects
    crossOriginOpenerPolicy    : false,

    // ❌ Desactiva COEP: no se usa SharedArrayBuffer, no es necesario
    crossOriginEmbedderPolicy  : false,

    // 🔐 Content Security Policy ajustada a API (sin HTML/assets propios)
    contentSecurityPolicy: {
      directives: {
        defaultSrc   : ["'none'"],
        scriptSrc    : ["'none'"],
        objectSrc    : ["'none'"],
        frameAncestors: ["'none'"],
      },
    },

    // 🔐 Fuerza HTTPS por 1 año + subdomains
    strictTransportSecurity: {
      maxAge            : 31536000,
      includeSubDomains : true,
      preload           : true,
    },

    // 🙈 Oculta la tecnología del servidor
    hidePoweredBy        : true,
    referrerPolicy       : { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions  : true,
    xFrameOptions        : { action: 'deny' },
    xXssProtection       : false, // obsoleto en navegadores modernos
  })
);

// ============================================================
// 🧹  SANITIZACIÓN & LIMPIEZA
// ============================================================

// Previene HTTP Parameter Pollution (?sort=asc&sort=desc)
app.use(hpp());

// Limpia claves con $ y . en req.body/query/params (NoSQL injection)
app.use(mongoSanitize());

// ============================================================
// 📊  LOGGING  (pino-http)
// ============================================================
const logger = pinoHttp({
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.password',
    'req.body.token',
  ],
  customLogLevel(req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        id    : req.id,
        method: req.method,
        url   : req.url,
        ip    : req.remoteAddress,
      };
    },
  },
});

app.use(logger);

// ============================================================
// 🚫  RATE LIMITERS
// ============================================================

// --- Global API ---
const globalLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000,
  max             : 100,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : { success: false, message: 'Demasiadas solicitudes, intenta más tarde.' },
  skip            : (req) => req.method === 'OPTIONS',
  // ✅ Sin keyGenerator — v8 maneja IPv6 automáticamente
});

// --- Login ---
const loginLimiter = rateLimit({
  windowMs        : 10 * 60 * 1000,
  max             : 5,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : { success: false, message: 'Demasiados intentos de login. Espera 10 minutos.' },
  // ✅ Sin keyGenerator
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📦  BODY PARSER
// ============================================================

// Limita tamaño del body (evita ataques payload grandes)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================================
// 🆔  REQUEST ID (trazabilidad por request)
// ============================================================
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
});

// ============================================================
// 🛣️  RUTAS
// ============================================================
app.use('/api/v1', require('./routes'));

// ============================================================
// ❤️  HEALTH CHECK
// ============================================================
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status : 'ok',
      env    : process.env.NODE_ENV,
      db     : 'connected',
      uptime : Math.floor(process.uptime()),
    });
  } catch (error) {
    req.log.error({ error }, 'Health check DB failure');
    res.status(503).json({
      status : 'error',
      env    : process.env.NODE_ENV,
      db     : 'disconnected',
    });
  }
});

// ============================================================
// ❌  404 HANDLER
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success : false,
    message : 'Ruta no encontrada',
  });
});

// ============================================================
// ❌  ERROR HANDLER GLOBAL
// ============================================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Error de CORS → no exponer detalles internos
  if (err.message?.startsWith('CORS no permitido')) {
    return res.status(403).json({
      success : false,
      message : 'Acceso no permitido por política CORS.',
    });
  }

  const status = err.status || err.statusCode || 500;

  // En producción nunca expongas el stack trace
  const body = {
    success : false,
    message : status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message || 'Error interno del servidor',
  };

  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  req.log?.error({ err, status }, 'Unhandled error');
  res.status(status).json(body);
});

// ============================================================
// ⏱️  CRON JOBS
// ============================================================
require('./jobs/mora.job');

// ============================================================
// EXPORT
// ============================================================
module.exports = app;