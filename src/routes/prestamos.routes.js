const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const PrestamoController = require('../controllers/prestamo.controller');

router.use(authMiddleware);

// Rutas principales
router.get('/', PrestamoController.listar);
router.get('/:id', PrestamoController.obtenerPorId);
router.post('/', PrestamoController.crear);
router.put('/:id', PrestamoController.actualizar);
router.delete('/:id', PrestamoController.eliminar);

// Rutas específicas
router.patch('/:id/estado', PrestamoController.actualizarEstado);
router.patch('/:id/cuotas/:cuotaId/pagar', PrestamoController.registrarPago);

module.exports = router;
