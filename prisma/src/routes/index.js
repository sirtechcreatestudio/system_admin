// src/routes/index.js

const router = require("express").Router();

// 🔐 AUTH
router.use('/auth', require('./auth.routes'));

// 💰 PRÉSTAMOS
router.use('/prestamos', require('./prestamos.routes'));

// 💳 PAGOS
router.use('/pagos', require('./pagos.routes'));

// 📊 DASHBOARD
router.use('/dashboard', require('./dashboard.routes'));

// 🧍 CLIENTES (🔜 en construcción)
router.use('/clientes', require('./clientes.routes'));

// ⚠️ MOROSOS
router.use('/morosos', require('./morosos.routes'));

// 💵 CAJA
router.use('/caja', require('./caja.routes'));

// 📑 REPORTES
router.use('/reportes', require('./reportes.routes'));

// 📋 CATÁLOGOS
router.use('/catalogos', require('./catalogos.routes'));

// 👤 USUARIOS (perfil)
router.use('/usuarios', require('./usuarios.routes'));

// 💰 FINANCIAMIENTOS ← ¡AGREGAR ESTA LÍNEA!
router.use('/financiamiento', require('./financiamiento.routes'));



module.exports = router;
