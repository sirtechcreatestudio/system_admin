const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

// Listar pagos
router.get('/', async (req, res) => {
  try {
    const pagos = await prisma.pagos.findMany({
      include: {
        prestamo: {
          include: { clientes: true }
        },
        cuota: true,
        usuario: true
      },
      orderBy: { fecha_pago: 'desc' }
    });

    const pagosFormateados = pagos.map(p => ({
      id: p.id,
      prestamo_id: p.prestamo_id,
      cuota_numero: p.cuota?.numero,
      monto: Number(p.monto),
      fecha_pago: p.fecha_pago,
      metodo_pago: p.metodo_pago,
      notas: p.notas,
      cliente: p.prestamo?.clientes?.nombre,
      cliente_id: p.prestamo?.clientes?.id,
      cedula: p.prestamo?.clientes?.cedula,
      usuario: p.usuario?.nombre,
      usuario_email: p.usuario?.email
    }));

    res.json({ success: true, data: pagosFormateados });
  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Resumen de pagos
router.get('/resumen', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    
    const [pagosHoy, pagosMes] = await Promise.all([
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { fecha_pago: { gte: hoy } }
      }),
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { fecha_pago: { gte: inicioMes } }
      })
    ]);
    
    res.json({
      success: true,
      data: {
        hoy: pagosHoy._sum.monto || 0,
        mes: pagosMes._sum.monto || 0
      }
    });
  } catch (error) {
    console.error('Error resumen pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtener un pago por ID
router.get('/:id', async (req, res) => {
  try {
    const pago = await prisma.pagos.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        prestamo: {
          include: { clientes: true }
        },
        cuota: true,
        usuario: true
      }
    });
    
    if (!pago) {
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }
    
    res.json({
      success: true,
      data: {
        id: pago.id,
        monto: Number(pago.monto),
        fecha_pago: pago.fecha_pago,
        metodo_pago: pago.metodo_pago,
        notas: pago.notas,
        cliente: pago.prestamo?.clientes?.nombre,
        cliente_id: pago.prestamo?.clientes?.id,
        cedula: pago.prestamo?.clientes?.cedula,
        prestamo_id: pago.prestamo_id,
        cuota_numero: pago.cuota?.numero,
        usuario: pago.usuario?.nombre,
        usuario_email: pago.usuario?.email
      }
    });
  } catch (error) {
    console.error('Error obteniendo pago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;