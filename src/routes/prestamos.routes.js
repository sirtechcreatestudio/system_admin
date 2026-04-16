const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

function calcularCuota(monto, interesAnual, plazoMeses) {
  if (!monto || !interesAnual || !plazoMeses || monto <= 0 || interesAnual <= 0 || plazoMeses <= 0) {
    return 0;
  }
  const tasaMensual = interesAnual / 100 / 12;
  const cuota = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
  return Math.round(cuota * 100) / 100;
}

// ============================================================
// LISTAR TODOS LOS PRÉSTAMOS
// ============================================================
router.get('/', async (req, res) => {
  try {
    const prestamos = await prisma.prestamos.findMany({
      include: {
        clientes: {
          select: { id: true, nombre: true, cedula: true, telefono: true, email: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    const prestamosFormateados = prestamos.map(p => ({
      id: p.id,
      cliente: p.clientes ? {
        id: p.clientes.id,
        nombre: p.clientes.nombre,
        cedula: p.clientes.cedula,
        telefono: p.clientes.telefono,
        email: p.clientes.email
      } : null,
      monto: Number(p.monto),
      interes: Number(p.interes),
      plazo: p.plazo,
      estado: p.estado,
      fecha_inicio: p.fecha_inicio,
      cuota_mensual: calcularCuota(Number(p.monto), Number(p.interes), p.plazo)
    }));

    res.json({ success: true, data: prestamosFormateados });
  } catch (error) {
    console.error('Error en GET /prestamos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// OBTENER UN PRÉSTAMO POR ID
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const prestamo = await prisma.prestamos.findUnique({
      where: { id },
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
        },
        cuotas: {
          orderBy: { numero: 'asc' }
        }
      }
    });

    if (!prestamo) {
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const tasaMensual = Number(prestamo.interes) / 100 / 12;
    const plazo = prestamo.plazo;
    const monto = Number(prestamo.monto);
    let cuotaMensual = 0;
    let saldo = monto;
    
    if (monto > 0 && tasaMensual > 0 && plazo > 0) {
      cuotaMensual = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
      cuotaMensual = Math.round(cuotaMensual * 100) / 100;
    }

    const cuotasConAmortizacion = prestamo.cuotas.map((cuota, index) => {
      const i = index + 1;
      let capital = 0;
      let interesCuota = 0;
      let saldoRestante = 0;
      
      if (cuotaMensual > 0) {
        interesCuota = saldo * tasaMensual;
        capital = cuotaMensual - interesCuota;
        saldoRestante = Math.max(saldo - capital, 0);
        saldo = saldoRestante;
      }
      
      return {
        id: cuota.id,
        numero: cuota.numero,
        monto: Number(cuota.monto),
        fecha_vencimiento: cuota.fecha_vencimiento,
        fecha_pago: cuota.fecha_pago,
        estado: cuota.estado,
        capital: Math.round(capital * 100) / 100,
        interes: Math.round(interesCuota * 100) / 100,
        saldo_restante: Math.round(saldoRestante * 100) / 100
      };
    });

    const prestamoFormateado = {
      id: prestamo.id,
      cliente: prestamo.clientes ? {
        id: prestamo.clientes.id,
        nombre: prestamo.clientes.nombre,
        cedula: prestamo.clientes.cedula,
        telefono: prestamo.clientes.telefono,
        email: prestamo.clientes.email,
        direccion: prestamo.clientes.direccion
      } : null,
      monto: monto,
      interes: Number(prestamo.interes),
      plazo: prestamo.plazo,
      estado: prestamo.estado,
      fecha_inicio: prestamo.fecha_inicio,
      cuota_mensual: cuotaMensual,
      cuotas: cuotasConAmortizacion
    };

    res.json({ success: true, data: prestamoFormateado });
  } catch (error) {
    console.error('Error en GET /prestamos/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// CREAR PRÉSTAMO
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { cliente_id, monto, interes, plazo, tipo_prestamo_id, plan_pago_id, fecha_inicio } = req.body;

    if (!cliente_id || !monto || !interes || !plazo) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: cliente_id, monto, interes, plazo'
      });
    }

    const cliente = await prisma.clientes.findUnique({ where: { id: parseInt(cliente_id) } });
    if (!cliente) {
      return res.status(400).json({ success: false, message: 'Cliente no encontrado' });
    }

    // Calcular cuota mensual
    const montoN = parseFloat(monto);
    const interesN = parseFloat(interes);
    const plazoN = parseInt(plazo);
    const cuotaMensual = calcularCuota(montoN, interesN, plazoN);

    const prestamo = await prisma.$transaction(async (tx) => {
      // 1. Crear préstamo — usar connect para relaciones, no IDs directos
      const createData = {
        clientes:    { connect: { id: parseInt(cliente_id) } },
        monto:       montoN,
        interes:     interesN,
        plazo:       plazoN,
        estado:      'pendiente',
        fecha_inicio: fecha_inicio ? new Date(fecha_inicio) : new Date()
      };

      // Conectar tipo_prestamo solo si se envió un ID válido
      if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
        createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
      }
      // Conectar plan_pago solo si se envió un ID válido
      if (plan_pago_id && parseInt(plan_pago_id) > 0) {
        createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
      }

      const p = await tx.prestamos.create({ data: createData });

      // 2. Generar cuotas + tabla de amortización
      let saldo = montoN;
      const tasaMensual = interesN / 100 / 12;

      for (let i = 1; i <= plazoN; i++) {
        const interesCuota = saldo * tasaMensual;
        const capital = cuotaMensual - interesCuota;
        saldo = Math.max(saldo - capital, 0);

        const fechaVenc = new Date(p.fecha_inicio);
        fechaVenc.setMonth(fechaVenc.getMonth() + i);

        // Cuota
        await tx.cuotas.create({
          data: {
            prestamo_id:       p.id,
            numero:            i,
            monto:             cuotaMensual,
            fecha_vencimiento: fechaVenc,
            estado:            'pendiente'
          }
        });

        // Amortización — solo campos que existen en el schema (sin cuota_id)
        await tx.amortizacion.create({
          data: {
            prestamo_id:    p.id,
            numero_cuota:   i,
            capital:        Math.round(capital * 100) / 100,
            interes:        Math.round(interesCuota * 100) / 100,
            saldo_restante: Math.round(saldo * 100) / 100,
            fecha_pago:     fechaVenc,
            estado:         'pendiente'
          }
        });
      }

      return p;
    });

    res.status(201).json({ success: true, message: 'Préstamo creado exitosamente', data: prestamo });
  } catch (error) {
    console.error('Error al crear préstamo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ACTUALIZAR PRÉSTAMO (datos generales)
// ============================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, monto, interes, plazo } = req.body;

    const prestamo = await prisma.prestamos.update({
      where: { id: parseInt(id) },
      data: {
        estado,
        monto: monto ? parseFloat(monto) : undefined,
        interes: interes ? parseFloat(interes) : undefined,
        plazo: plazo ? parseInt(plazo) : undefined
      }
    });

    res.json({ success: true, data: prestamo });
  } catch (error) {
    console.error('Error al actualizar préstamo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REGISTRAR PAGO DE UNA CUOTA
// ============================================================
// Registrar pago de una cuota
router.patch('/:id/cuotas/:cuotaId/pagar', async (req, res) => {
  try {
    const prestamoId = parseInt(req.params.id);
    const cuotaId = parseInt(req.params.cuotaId);
    const { fecha_pago, monto_pagado, notas } = req.body;

    const cuota = await prisma.cuotas.findFirst({
      where: {
        id: cuotaId,
        prestamo_id: prestamoId
      }
    });

    if (!cuota) {
      return res.status(404).json({ success: false, message: 'Cuota no encontrada' });
    }

    if (cuota.estado === 'pagado') {
      return res.status(400).json({ success: false, message: 'Esta cuota ya fue pagada' });
    }

    const fechaPago = fecha_pago ? new Date(fecha_pago) : new Date();
    const montoPagado = monto_pagado || cuota.monto;

    // Actualizar la cuota
    await prisma.cuotas.update({
      where: { id: cuotaId },
      data: {
        estado: 'pagado',
        fecha_pago: fechaPago,
        monto_pagado: parseFloat(montoPagado)
      }
    });

    // Verificar que el usuario del token exista en BD
    // Si no existe (usuario eliminado, token viejo) usar el primer usuario activo
    let usuarioId = req.user?.id;
    const usuarioExiste = usuarioId
      ? await prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { id: true } })
      : null;

    if (!usuarioExiste) {
      const fallback = await prisma.usuarios.findFirst({
        where: { estado: 'activo' },
        select: { id: true }
      });
      if (!fallback) {
        return res.status(400).json({ success: false, message: 'No hay usuarios activos en el sistema' });
      }
      usuarioId = fallback.id;
    }

    await prisma.pagos.create({
      data: {
        prestamo:    { connect: { id: prestamoId } },
        cuota:       { connect: { id: cuotaId } },
        monto:       parseFloat(montoPagado),
        fecha_pago:  fechaPago,
        metodo_pago: 'efectivo',
        usuario:     { connect: { id: usuarioId } },
        notas:       notas || null
      }
    });

    // Verificar si todas las cuotas están pagadas
    const cuotasPendientes = await prisma.cuotas.count({
      where: {
        prestamo_id: prestamoId,
        estado: 'pendiente'
      }
    });

    if (cuotasPendientes === 0) {
      await prisma.prestamos.update({
        where: { id: prestamoId },
        data: { estado: 'pagado' }
      });
    }

    res.json({ success: true, message: 'Pago registrado exitosamente' });
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// ============================================================
// ACTUALIZAR ESTADO DE UN PRÉSTAMO
// ============================================================
router.put('/:id/estado', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { estado } = req.body;

    const estadosValidos = ['pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado', 'cancelado'];
    
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ 
        success: false, 
        message: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}` 
      });
    }

    const prestamoExistente = await prisma.prestamos.findUnique({ where: { id } });
    if (!prestamoExistente) {
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const prestamo = await prisma.prestamos.update({
      where: { id },
      data: { estado }
    });

    res.json({ 
      success: true, 
      message: 'Estado actualizado exitosamente',
      data: { id: prestamo.id, estado: prestamo.estado }
    });
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;