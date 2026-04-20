const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

// Tipos de préstamo — sin filtro hardcodeado
router.get('/tipos-prestamo', async (req, res) => {
  try {
    const tipos = await prisma.tipos_prestamo.findMany({ orderBy: { id: 'asc' } });
    res.json({ success: true, data: tipos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// Planes de pago — sin filtro hardcodeado
router.get('/planes-pago', async (req, res) => {
  try {
    const planes = await prisma.planes_pago.findMany({ orderBy: { id: 'asc' } });
    res.json({ success: true, data: planes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// Métodos de pago
router.get('/metodos-pago', async (req, res) => {
  try {
    const metodos = await prisma.metodos_pago.findMany({ orderBy: { id: 'asc' } });
    res.json({ success: true, data: metodos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

module.exports = router;
