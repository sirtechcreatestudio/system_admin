// src/routes/dashboard.routes.js
const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const dashboardController = require('../controllers/dashboard.controller');

router.use(authMiddleware);

router.get('/stats', dashboardController.getDashboard);

module.exports = router;