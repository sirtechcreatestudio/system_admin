const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/authorize');
const usuariosController = require('../controllers/usuarios.controller');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas específicas PRIMERO
router.get('/roles', usuariosController.getRoles);
router.patch('/:id/estado', authorize('gestionar_usuarios'), usuariosController.toggleEstado);
router.put('/:id/password', usuariosController.changePassword);

// Rutas con parámetros DESPUÉS
router.get('/', usuariosController.getAll);
router.get('/:id', usuariosController.getById);
router.post('/', authorize('gestionar_usuarios'), usuariosController.create);
router.put('/:id', authorize('gestionar_usuarios'), usuariosController.update);
router.delete('/:id', authorize('gestionar_usuarios'), usuariosController.delete);

module.exports = router;