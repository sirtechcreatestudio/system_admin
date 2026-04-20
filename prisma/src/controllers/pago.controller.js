const prisma = require('../config/prisma');

const PagoController = {
  // Listar todos los pagos con filtros
  async listar(req, res) {
    try {
      const { fecha_inicio, fecha_fin, cliente_id, prestamo_id } = req.query;
      
      const where = {};
      
      if (fecha_inicio || fecha_fin) {
        where.fecha_pago = {};
        if (fecha_inicio) where.fecha_pago.gte = new Date(fecha_inicio);
        if (fecha_fin) where.fecha_pago.lte = new Date(fecha_fin);
      }
      
      if (prestamo_id) where.prestamo_id = parseInt(prestamo_id);
      
      const pagos = await prisma.pagos.findMany({
        where,
        include: {
          prestamo: {
            include: {
              clientes: {
                select: {
                  id: true,
                  nombre: true,
                  cedula: true,
                  telefono: true,
                  email: true
                }
              }
            }
          },
          cuota: true,
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        },
        orderBy: { fecha_pago: 'desc' }
      });
      
      const pagosFormateados = pagos.map(p => ({
        id: p.id,
        prestamo_id: p.prestamo_id,
        cuota_id: p.cuota_id,
        cuota_numero: p.cuota?.numero,
        monto: Number(p.monto),
        fecha_pago: p.fecha_pago,
        metodo_pago: p.metodo_pago,
        notas: p.notas,
        cliente: p.prestamo?.clientes?.nombre || 'N/A',
        cliente_id: p.prestamo?.clientes?.id,
        cedula: p.prestamo?.clientes?.cedula,
        telefono: p.prestamo?.clientes?.telefono,
        email: p.prestamo?.clientes?.email,
        usuario: p.usuario?.nombre || 'Sistema',
        usuario_email: p.usuario?.email
      }));
      
      res.json({ success: true, data: pagosFormateados });
    } catch (error) {
      console.error('Error listando pagos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
  
  // Obtener detalle de un pago específico
  async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      
      const pago = await prisma.pagos.findUnique({
        where: { id: parseInt(id) },
        include: {
          prestamo: {
            include: {
              clientes: {
                select: {
                  id: true,
                  nombre: true,
                  cedula: true,
                  telefono: true,
                  email: true,
                  direccion: true
                }
              }
            }
          },
          cuota: {
            select: {
              id: true,
              numero: true,
              monto: true,
              fecha_vencimiento: true,
              estado: true
            }
          },
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        }
      });
      
      if (!pago) {
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }
      
      // Calcular saldo pendiente del préstamo
      const cuotasPagadas = await prisma.cuotas.aggregate({
        _sum: { monto_pagado: true },
        where: {
          prestamo_id: pago.prestamo_id,
          estado: 'pagado'
        }
      });
      
      const montoPrestamo = Number(pago.prestamo.monto);
      const interes = Number(pago.prestamo.interes);
      const plazo = pago.prestamo.plazo;
      const tasaMensual = interes / 100 / 12;
      const cuotaMensual = montoPrestamo * (tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
      const totalAPagar = cuotaMensual * plazo;
      const saldoPendiente = totalAPagar - (cuotasPagadas._sum.monto_pagado || 0);
      
      res.json({
        success: true,
        data: {
          id: pago.id,
          monto: Number(pago.monto),
          fecha_pago: pago.fecha_pago,
          metodo_pago: pago.metodo_pago,
          notas: pago.notas || null,
          cliente: pago.prestamo?.clientes?.nombre,
          cliente_id: pago.prestamo?.clientes?.id,
          cedula: pago.prestamo?.clientes?.cedula,
          telefono: pago.prestamo?.clientes?.telefono,
          email: pago.prestamo?.clientes?.email,
          direccion: pago.prestamo?.clientes?.direccion,
          prestamo_id: pago.prestamo_id,
          prestamo_monto: Number(pago.prestamo.monto),
          prestamo_interes: Number(pago.prestamo.interes),
          prestamo_plazo: pago.prestamo.plazo,
          cuota_id: pago.cuota_id,
          cuota_numero: pago.cuota?.numero,
          cuota_monto: Number(pago.cuota?.monto || 0),
          cuota_fecha_vencimiento: pago.cuota?.fecha_vencimiento,
          saldo_pendiente: Math.max(saldoPendiente, 0),
          usuario: pago.usuario?.nombre,
          usuario_email: pago.usuario?.email,
          total_cuotas: pago.prestamo.plazo
        }
      });
    } catch (error) {
      console.error('Error obteniendo pago:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
  
  // Obtener resumen de pagos por período
  async resumen(req, res) {
    try {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const [pagosHoy, pagosMes, pagosPorMetodo, ultimosPagos] = await Promise.all([
        prisma.pagos.aggregate({
          _sum: { monto: true },
          where: { fecha_pago: { gte: hoy } }
        }),
        prisma.pagos.aggregate({
          _sum: { monto: true },
          where: { fecha_pago: { gte: inicioMes } }
        }),
        prisma.pagos.groupBy({
          by: ['metodo_pago'],
          _sum: { monto: true },
          _count: true
        }),
        prisma.pagos.findMany({
          take: 5,
          orderBy: { fecha_pago: 'desc' },
          include: {
            prestamo: {
              include: {
                clientes: true
              }
            }
          }
        })
      ]);
      
      res.json({
        success: true,
        data: {
          hoy: pagosHoy._sum.monto || 0,
          mes: pagosMes._sum.monto || 0,
          por_metodo: pagosPorMetodo,
          ultimos_pagos: ultimosPagos.map(p => ({
            id: p.id,
            cliente: p.prestamo?.clientes?.nombre,
            monto: Number(p.monto),
            metodo: p.metodo_pago,
            fecha: p.fecha_pago
          }))
        }
      });
    } catch (error) {
      console.error('Error resumen pagos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = PagoController;