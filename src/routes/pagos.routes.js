// src/routes/pagos.routes.js
// CORRECCIONES:
// 1. saldo_pendiente se calculaba con cuota.saldo_restante (campo de amortización,
//    no del pago) — ahora se lee desde prestamos.saldo_actual
// 2. El resumen faltaba filtrar deleted_at IS NULL

const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

// ============================================================
// LISTAR PAGOS
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, prestamo_id } = req.query;

    const where = { deleted_at: null };
    if (fecha_inicio || fecha_fin) {
      where.fecha_pago = {};
      if (fecha_inicio) where.fecha_pago.gte = new Date(fecha_inicio);
      if (fecha_fin)    where.fecha_pago.lte = new Date(fecha_fin);
    }
    if (prestamo_id) where.prestamo_id = parseInt(prestamo_id);

    const pagos = await prisma.pagos.findMany({
      where,
      include: {
        prestamo: {
          include: {
            clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true } }
          }
        },
        cuota:   true,
        usuario: { select: { id: true, nombre: true, email: true } }
      },
      orderBy: { fecha_pago: 'desc' }
    });

    const data = pagos.map(p => ({
      id:              p.id,
      prestamo_id:     p.prestamo_id,
      cuota_numero:    p.cuota?.numero,
      total_cuotas:    p.prestamo?.plazo,
      // CORRECCIÓN: saldo_pendiente desde prestamo.saldo_actual
      saldo_pendiente: Number(p.prestamo?.saldo_actual ?? 0),
      monto:           Number(p.monto),
      fecha_pago:      p.fecha_pago,
      metodo_pago:     p.metodo_pago,
      notas:           p.notas,
      cliente:         p.prestamo?.clientes?.nombre,
      cliente_id:      p.prestamo?.clientes?.id,
      cedula:          p.prestamo?.clientes?.cedula,
      telefono:        p.prestamo?.clientes?.telefono,
      email:           p.prestamo?.clientes?.email,
      usuario:         p.usuario?.nombre,
      usuario_email:   p.usuario?.email
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// RESUMEN DE PAGOS
// ============================================================
router.get('/resumen', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());

    const inicioQuincena = new Date(hoy);
    inicioQuincena.setDate(hoy.getDate() <= 15 ? 1 : 16);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const baseWhere = { deleted_at: null };

    const [pagosHoy, pagosSemana, pagosQuincena, pagosMes] = await Promise.all([
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { ...baseWhere, fecha_pago: { gte: hoy } }
      }),
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { ...baseWhere, fecha_pago: { gte: inicioSemana } }
      }),
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { ...baseWhere, fecha_pago: { gte: inicioQuincena } }
      }),
      prisma.pagos.aggregate({
        _sum: { monto: true },
        where: { ...baseWhere, fecha_pago: { gte: inicioMes } }
      })
    ]);

    res.json({
      success: true,
      data: {
        hoy:       Number(pagosHoy._sum.monto)       || 0,
        semana:    Number(pagosSemana._sum.monto)    || 0,
        quincena:  Number(pagosQuincena._sum.monto)  || 0,
        mes:       Number(pagosMes._sum.monto)       || 0
      }
    });
  } catch (error) {
    console.error('Error resumen pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// OBTENER PAGO POR ID
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const pago = await prisma.pagos.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        prestamo: {
          include: {
            clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true, direccion: true } }
          }
        },
        cuota:   { select: { id: true, numero: true, monto: true, fecha_vencimiento: true, estado: true, monto_pagado: true } },
        usuario: { select: { id: true, nombre: true, email: true } }
      }
    });

    if (!pago) return res.status(404).json({ success: false, message: 'Pago no encontrado' });

    res.json({
      success: true,
      data: {
        id:                       pago.id,
        monto:                    Number(pago.monto),
        fecha_pago:               pago.fecha_pago,
        metodo_pago:              pago.metodo_pago,
        notas:                    pago.notas || null,
        cliente:                  pago.prestamo?.clientes?.nombre,
        cliente_id:               pago.prestamo?.clientes?.id,
        cedula:                   pago.prestamo?.clientes?.cedula,
        telefono:                 pago.prestamo?.clientes?.telefono,
        email:                    pago.prestamo?.clientes?.email,
        direccion:                pago.prestamo?.clientes?.direccion,
        prestamo_id:              pago.prestamo_id,
        prestamo_monto:           Number(pago.prestamo?.monto || 0),
        prestamo_interes:         Number(pago.prestamo?.interes || 0),
        prestamo_plazo:           pago.prestamo?.plazo,
        // CORRECCIÓN: saldo real desde saldo_actual
        saldo_pendiente:          Number(pago.prestamo?.saldo_actual ?? 0),
        cuota_id:                 pago.cuota_id,
        cuota_numero:             pago.cuota?.numero,
        cuota_monto:              Number(pago.cuota?.monto || 0),
        cuota_monto_pagado:       Number(pago.cuota?.monto_pagado || 0),
        cuota_fecha_vencimiento:  pago.cuota?.fecha_vencimiento,
        total_cuotas:             pago.prestamo?.plazo,
        usuario:                  pago.usuario?.nombre,
        usuario_email:            pago.usuario?.email
      }
    });
  } catch (error) {
    console.error('Error obteniendo pago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;