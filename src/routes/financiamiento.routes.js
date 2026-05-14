'use strict';

// src/routes/financiamiento.routes.js
const { Router }   = require('express');
const ctrl         = require('../controllers/financiamiento.controller');
const { authMiddleware } = require('../middleware/auth.middleware'); // ← CORREGIDO

const router = Router();

// Todas las rutas del módulo requieren JWT válido
router.use(authMiddleware); // ← CORREGIDO

// ⚠️  /stats DEBE ir ANTES de /:id para que Express no lo trate como un ID
router.get ('/',       ctrl.listar);
router.get ('/stats',  ctrl.stats);
router.get ('/:id',    ctrl.obtenerPorId);
router.post('/',       ctrl.crear);
router.patch('/:id',   ctrl.actualizar);
router.delete('/:id',  ctrl.eliminar);

module.exports = router;
