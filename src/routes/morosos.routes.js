const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

// Obtener lista de morosos (clientes con cuotas vencidas)
router.get('/', async (req, res) => {
  try {
    // Obtener todas las cuotas pendientes con fecha vencida
    const cuotasVencidas = await prisma.cuotas.findMany({
      where: {
        estado: 'pendiente',
        fecha_vencimiento: { lt: new Date() }
      },
      include: {
        prestamo: {
          include: {
            clientes: true
          }
        }
      },
      orderBy: { fecha_vencimiento: 'asc' }
    });

    // Agrupar por cliente/préstamo
    const morososMap = new Map();

    for (const cuota of cuotasVencidas) {
      const prestamo = cuota.prestamo;
      const cliente = prestamo?.clientes;
      
      if (!cliente) continue;

      const key = `${cliente.id}_${prestamo.id}`;
      const diasMora = Math.floor((new Date() - new Date(cuota.fecha_vencimiento)) / (1000 * 60 * 60 * 24));
      
      if (!morososMap.has(key)) {
        morososMap.set(key, {
          id: cliente.id,
          prestamo_id: prestamo.id,
          nombre: cliente.nombre,
          cedula: cliente.cedula,
          telefono: cliente.telefono,
          email: cliente.email,
          monto_prestamo: Number(prestamo.monto),
          cuotas_vencidas: 0,
          monto_mora: 0,
          dias_mora: 0,
          score: 0,
          cuotas: []
        });
      }

      const moroso = morososMap.get(key);
      moroso.cuotas_vencidas++;
      moroso.monto_mora += Number(cuota.monto);
      moroso.dias_mora = Math.max(moroso.dias_mora, diasMora);
      moroso.cuotas.push({ numero: cuota.numero, monto: cuota.monto, dias: diasMora });
    }

    // Calcular score de riesgo para cada moroso
    const morososList = Array.from(morososMap.values()).map(m => {
      // Score basado en: días de mora (60%) + cantidad de cuotas (40%)
      let score = 0;
      if (m.dias_mora > 60) score = 100;
      else if (m.dias_mora > 30) score = 70 + (m.dias_mora - 30) / 30 * 30;
      else if (m.dias_mora > 0) score = 30 + (m.dias_mora / 30) * 40;
      
      // Ajustar por cantidad de cuotas
      if (m.cuotas_vencidas >= 3) score = Math.min(score + 20, 100);
      else if (m.cuotas_vencidas >= 2) score = Math.min(score + 10, 100);
      
      return {
        ...m,
        score: Math.round(score),
        monto_mora: Math.round(m.monto_mora * 100) / 100
      };
    });

    // Ordenar por score descendente (mayor riesgo primero)
    morososList.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: morososList,
      total: morososList.length,
      total_mora: morososList.reduce((sum, m) => sum + m.monto_mora, 0)
    });
  } catch (error) {
    console.error('Error al obtener morosos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtener detalle de un cliente moroso
router.get('/:id', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id);
    
    const cuotasVencidas = await prisma.cuotas.findMany({
      where: {
        estado: 'pendiente',
        fecha_vencimiento: { lt: new Date() },
        prestamo: {
          cliente_id: clienteId
        }
      },
      include: {
        prestamo: {
          include: {
            clientes: true
          }
        }
      },
      orderBy: { fecha_vencimiento: 'asc' }
    });

    if (cuotasVencidas.length === 0) {
      return res.status(404).json({ success: false, message: 'Cliente sin mora activa' });
    }

    const prestamo = cuotasVencidas[0].prestamo;
    const cliente = prestamo.clientes;

    const detalles = cuotasVencidas.map(c => ({
      cuota_numero: c.numero,
      monto: Number(c.monto),
      fecha_vencimiento: c.fecha_vencimiento,
      dias_mora: Math.floor((new Date() - new Date(c.fecha_vencimiento)) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      success: true,
      data: {
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          cedula: cliente.cedula,
          telefono: cliente.telefono,
          email: cliente.email
        },
        prestamo_id: prestamo.id,
        prestamo_monto: Number(prestamo.monto),
        cuotas_vencidas: cuotasVencidas.length,
        monto_total_mora: detalles.reduce((sum, c) => sum + c.monto, 0),
        cuotas: detalles
      }
    });
  } catch (error) {
    console.error('Error al obtener detalle de moroso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;