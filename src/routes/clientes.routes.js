const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const clienteController = require('../controllers/clientes.controller');
const prisma = require('../config/prisma');

router.use(authMiddleware);

router.get('/', clienteController.findAll);
router.post('/', clienteController.create);

// GET /clientes/:id — incluye préstamos del cliente
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cliente = await prisma.clientes.findUnique({
      where: { id },
      include: {
        prestamos: {
          orderBy: { created_at: 'desc' },
          include: {
            tipos_prestamo: { select: { nombre: true } },
            planes_pago:    { select: { nombre: true } }
          }
        },
        referencias: true
      }
    });
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    // Calcular cuota mensual para cada préstamo
    function calcCuota(monto, interesAnual, plazo) {
      if (!monto || !interesAnual || !plazo) return 0;
      const t = interesAnual / 100 / 12;
      return Math.round(monto * (t * Math.pow(1 + t, plazo)) / (Math.pow(1 + t, plazo) - 1) * 100) / 100;
    }

    const prestamosFormateados = cliente.prestamos.map(p => ({
      id: p.id,
      monto: Number(p.monto),
      interes: Number(p.interes),
      plazo: p.plazo,
      estado: p.estado,
      fecha_inicio: p.fecha_inicio,
      cuota_mensual: calcCuota(Number(p.monto), Number(p.interes), p.plazo),
      tipo_prestamo: p.tipos_prestamo?.nombre || null,
      plan_pago: p.planes_pago?.nombre || null
    }));

    res.json({
      success: true,
      data: {
        id: cliente.id,
        nombre: cliente.nombre,
        cedula: cliente.cedula,
        telefono: cliente.telefono,
        email: cliente.email,
        direccion: cliente.direccion,
        estado: cliente.estado,
        created_at: cliente.created_at,
        referencias: cliente.referencias,
        prestamos: prestamosFormateados,
        // resumen rápido
        total_prestamos: prestamosFormateados.length,
        prestamos_activos: prestamosFormateados.filter(p => ['activo','atrasado'].includes(p.estado)).length,
        deuda_total: prestamosFormateados.filter(p => ['activo','atrasado'].includes(p.estado)).reduce((s, p) => s + p.monto, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', clienteController.update);
router.delete('/:id', clienteController.delete);

module.exports = router;
