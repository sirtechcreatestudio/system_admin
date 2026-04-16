const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/authorize');

// Rutas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);

// Ruta para obtener perfil (protegida)
router.get('/profile', authMiddleware, authController.getProfile);

// Ruta para admin - crear usuarios con cualquier rol
router.post('/admin/register', 
  authMiddleware,
  authorize('gestionar_usuarios'),
  authController.registerByAdmin
);

module.exports = router;