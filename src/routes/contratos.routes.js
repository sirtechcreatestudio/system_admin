// src/routes/contratos.routes.js
// GET /api/v1/contratos/:prestamoId  → descarga el PDF del contrato

const router          = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const contratoService = require('../services/contrato.service');

router.use(authMiddleware);

/**
 * GET /api/v1/contratos/:prestamoId
 * Genera y descarga el contrato PDF del préstamo indicado.
 */
router.get('/:prestamoId', async (req, res) => {
  try {
    const { prestamoId } = req.params;

    if (!prestamoId || isNaN(parseInt(prestamoId))) {
      return res.status(400).json({ success: false, message: 'ID de préstamo inválido' });
    }

    const pdfBuffer = await contratoService.generarContratoPDF(prestamoId);

    const filename = `contrato-prestamo-${String(prestamoId).padStart(6, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error generando contrato PDF:', error);

    if (error.message === 'Préstamo no encontrado') {
      return res.status(404).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: 'Error generando el contrato. Intenta de nuevo.' });
  }
});

module.exports = router;