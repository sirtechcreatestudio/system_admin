const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const PrestamoController = require('../controllers/prestamo.controller');

router.use(authMiddleware);

// ============================================================
// RUTAS PRINCIPALES
// ============================================================

// GET /api/prestamos - Listar todos los préstamos
router.get('/', PrestamoController.listar);

// GET /api/prestamos/:id - Obtener un préstamo por ID
router.get('/:id', PrestamoController.obtenerPorId);

// POST /api/prestamos - Crear un nuevo préstamo
router.post('/', PrestamoController.crear);

// PUT /api/prestamos/:id - Actualizar un préstamo
router.put('/:id', PrestamoController.actualizar);

// DELETE /api/prestamos/:id - Eliminar un préstamo
router.delete('/:id', PrestamoController.eliminar);

// ============================================================
// RUTAS DE ESTADO
// ============================================================

// PUT /api/prestamos/:id/estado - Actualizar estado del préstamo
router.put('/:id/estado', PrestamoController.actualizarEstado);

// ============================================================
// RUTAS DE PAGOS
// ============================================================

// PATCH /api/prestamos/:id/cuotas/:cuotaId/pagar - Registrar pago de una cuota
router.patch('/:id/cuotas/:cuotaId/pagar', PrestamoController.registrarPago);

module.exports = router;
