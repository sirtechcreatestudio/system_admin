'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/financiamiento.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

const router = Router();

router.use(authMiddleware);

// ✅ ORDEN CORRECTO: /stats ANTES de /:id
router.get('/stats',  ctrl.stats);        // ← PRIMERO
router.get('/',       ctrl.listar);       // ← SEGUNDO
router.get('/:id',    ctrl.obtenerPorId); // ← TERCERO
router.post('/',      ctrl.crear);
router.patch('/:id',  ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
