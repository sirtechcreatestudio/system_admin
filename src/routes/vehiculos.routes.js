const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const VehiculoController = require('../controllers/vehiculos.controller');

// Middleware de autenticación para todas las rutas
router.use(authMiddleware);

// Rutas CRUD
router.get('/', VehiculoController.findAll);
router.get('/estadisticas', VehiculoController.getEstadisticas);
router.get('/:id', VehiculoController.findById);
router.post('/', VehiculoController.create);
router.put('/:id', VehiculoController.update);
router.delete('/:id', VehiculoController.delete);

module.exports = router;