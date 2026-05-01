const prisma = require('../config/prisma');

// ============================================================
// HELPERS DE CÁLCULO
// ============================================================

function tasaPorFrecuencia(interesMensual, frecuencia) {
  const tasaMensual = interesMensual / 100;
  switch (frecuencia) {
    case 'diaria':    
      return tasaMensual / 26;     // ✅ 26 días hábiles (coincide con UI)
    case 'semanal':   
      return tasaMensual / 4;
    case 'quincenal': 
      return tasaMensual / 2;
    default:          
      return tasaMensual;
  }
}

function calcularCuotaPorPeriodo(monto, tasaPeriodo, periodos) {
  if (!monto || !tasaPeriodo || !periodos || monto <= 0 || periodos <= 0) return 0;
  if (tasaPeriodo === 0) return monto / periodos;
  const factor = Math.pow(1 + tasaPeriodo, periodos);
  const cuota = monto * (tasaPeriodo * factor) / (factor - 1);
  return Math.round(cuota * 100) / 100;
}

function sumarPeriodo(fecha, n, frecuencia) {
  const d = new Date(fecha);
  switch (frecuencia) {
    case 'diaria': {
      // Saltar domingos (día 0 = domingo)
      let diasAgregados = 0;
      while (diasAgregados < n) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) {  // 0 = domingo
          diasAgregados++;
        }
      }
      break;
    }
    case 'semanal':
      d.setDate(d.getDate() + n * 7);
      break;
    case 'quincenal':
      d.setDate(d.getDate() + n * 15);
      break;
    default:
      d.setMonth(d.getMonth() + n);
  }
  return d;
}

function normalizarFrecuencia(frecuencia) {
  if (frecuencia === 'diario') return 'diaria';
  return frecuencia || 'mensual';
}

function plazoEnMeses(plazo, frecuencia) {
  switch (frecuencia) {
    case 'diaria':    return plazo / 30;  // Aproximación a meses
    case 'semanal':   return plazo / 4;
    case 'quincenal': return plazo / 2;
    default:          return plazo;
  }
}

// ============================================================
// MÉTODOS DEL SERVICIO
// ============================================================

async function listarPrestamos() {
  const prestamos = await prisma.prestamos.findMany({
    include: {
      clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true } }
    },
    orderBy: { id: 'asc' }
  });

  return prestamos.map(p => ({
    id: p.id,
    cliente: p.clientes,
    monto: Number(p.monto),
    interes: Number(p.interes),
    plazo: p.plazo,
    frecuencia_pago: p.frecuencia_pago,
    estado: p.estado,
    fecha_inicio: p.fecha_inicio,
    saldo_actual: Number(p.saldo_actual)
  }));
}

async function obtenerPrestamoPorId(id) {
  const prestamo = await prisma.prestamos.findUnique({
    where: { id: parseInt(id) },
    include: {
      clientes: true,
      cuotas: { orderBy: { numero: 'asc' } },
      amortizacion: { orderBy: { numero_cuota: 'asc' } }
    }
  });

  if (!prestamo) throw new Error('Préstamo no encontrado');

  return {
    ...prestamo,
    cliente: prestamo.clientes,
    monto: Number(prestamo.monto),
    interes: Number(prestamo.interes),
    saldo_actual: Number(prestamo.saldo_actual)
  };
}

async function crearPrestamo(data) {
  const {
    cliente_id,
    monto,
    interes,
    plazo,
    frecuencia_pago = 'mensual',
    tipo_prestamo_id,
    plan_pago_id,
    fecha_inicio
  } = data;

  const frecNorm = normalizarFrecuencia(frecuencia_pago);
  const montoN = parseFloat(monto);
  const interesMensual = parseFloat(interes);
  const plazoN = parseInt(plazo);
  const fechaBase = fecha_inicio ? new Date(fecha_inicio) : new Date();

  const tasaPeriodo = tasaPorFrecuencia(interesMensual, frecNorm);
  const cuotaPeriodo = calcularCuotaPorPeriodo(montoN, tasaPeriodo, plazoN);
  const plazoMesesEquiv = plazoEnMeses(plazoN, frecNorm);

  console.log('📊 Creando préstamo:', {
    monto: montoN,
    interesMensual,
    frecuencia: frecNorm,
    plazo: plazoN,
    tasaPeriodo: tasaPeriodo * 100 + '%',
    cuotaPeriodo
  });

  return await prisma.$transaction(async (tx) => {
    const createData = {
      clientes: { connect: { id: parseInt(cliente_id) } },
      monto: montoN,
      interes: interesMensual,
      plazo: plazoMesesEquiv,
      frecuencia_pago: frecNorm,
      estado: 'pendiente',
      fecha_inicio: fechaBase,
      saldo_actual: montoN
    };

    if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
      createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
    }
    if (plan_pago_id && parseInt(plan_pago_id) > 0) {
      createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
    }

    const prestamo = await tx.prestamos.create({ data: createData });

    // Generar cuotas
    let saldoRestante = montoN;
    const cuotasData = [];
    const amortizacionData = [];

    for (let i = 1; i <= plazoN; i++) {
      const interesCuota = saldoRestante * tasaPeriodo;
      let capitalCuota = cuotaPeriodo - interesCuota;

      if (i === plazoN) {
        capitalCuota = saldoRestante;
      } else if (capitalCuota < 0) {
        capitalCuota = 0;
      }

      saldoRestante = Math.max(saldoRestante - capitalCuota, 0);
      const fechaVenc = sumarPeriodo(fechaBase, i, frecNorm);

      cuotasData.push({
        prestamo_id: prestamo.id,
        numero: i,
        monto: cuotaPeriodo,
        fecha_vencimiento: fechaVenc,
        estado: 'pendiente'
      });

      amortizacionData.push({
        prestamo_id: prestamo.id,
        numero_cuota: i,
        capital: parseFloat(capitalCuota.toFixed(2)),
        interes: parseFloat(interesCuota.toFixed(2)),
        saldo_restante: parseFloat(saldoRestante.toFixed(2)),
        fecha_pago: fechaVenc,
        estado: 'pendiente'
      });
    }

    await tx.cuotas.createMany({ data: cuotasData });
    await tx.amortizacion.createMany({ data: amortizacionData });

    console.log(`✅ Generadas ${cuotasData.length} cuotas de RD$ ${cuotaPeriodo}`);

    return prestamo;
  });
}

async function actualizarPrestamo(id, data) {
  const updateData = {};
  
  if (data.estado !== undefined) updateData.estado = data.estado;
  if (data.monto !== undefined) updateData.monto = parseFloat(data.monto);
  if (data.interes !== undefined) updateData.interes = parseFloat(data.interes);
  if (data.plazo !== undefined) updateData.plazo = parseInt(data.plazo);
  if (data.fecha_inicio !== undefined) updateData.fecha_inicio = new Date(data.fecha_inicio);

  return await prisma.prestamos.update({
    where: { id: parseInt(id) },
    data: updateData
  });
}

async function eliminarPrestamo(id) {
  await prisma.prestamos.delete({ where: { id: parseInt(id) } });
  return true;
}

async function registrarPago(prestamoId, cuotaId, data) {
  const { fecha_pago, monto_pagado, notas, usuario_id } = data;
  const fechaPago = fecha_pago ? new Date(fecha_pago) : new Date();

  // Obtener la cuota
  const cuota = await prisma.cuotas.findFirst({
    where: { id: parseInt(cuotaId), prestamo_id: parseInt(prestamoId) }
  });

  if (!cuota) throw new Error('Cuota no encontrada');
  if (cuota.estado === 'pagado') throw new Error('Esta cuota ya fue pagada');

  // ✅ Obtener el préstamo por separado
  const prestamo = await prisma.prestamos.findUnique({
    where: { id: parseInt(prestamoId) }
  });

  if (!prestamo) throw new Error('Préstamo no encontrado');

  const montoPagado = monto_pagado ? parseFloat(monto_pagado) : cuota.monto;
  if (montoPagado > cuota.monto) {
    throw new Error(`El monto pagado (${montoPagado}) no puede ser mayor al de la cuota (${cuota.monto})`);
  }

  return await prisma.$transaction(async (tx) => {
    await tx.cuotas.update({
      where: { id: parseInt(cuotaId) },
      data: {
        estado: montoPagado === cuota.monto ? 'pagado' : 'parcial',
        fecha_pago: fechaPago,
        monto_pagado: montoPagado
      }
    });

    const amortizacion = await tx.amortizacion.findFirst({
      where: { prestamo_id: parseInt(prestamoId), numero_cuota: cuota.numero }
    });

    if (amortizacion) {
      await tx.amortizacion.update({
        where: { id: amortizacion.id },
        data: {
          estado: montoPagado === cuota.monto ? 'pagado' : 'pendiente',  // ← pendiente, no parcial
          fecha_pago: fechaPago
        }
      });
    }

    await tx.pagos.create({
      data: {
        prestamo: { connect: { id: parseInt(prestamoId) } },
        cuota: { connect: { id: parseInt(cuotaId) } },
        monto: montoPagado,
        fecha_pago: fechaPago,
        metodo_pago: 'efectivo',
        usuario: { connect: { id: parseInt(usuario_id) } },
        notas: notas || null
      }
    });

    const totalPagado = await tx.cuotas.aggregate({
      where: { prestamo_id: parseInt(prestamoId), estado: { in: ['pagado', 'parcial'] } },
      _sum: { monto_pagado: true }
    });

    // ✅ Usar prestamo.monto (que obtuvimos aparte)
    const nuevoSaldo = prestamo.monto - (totalPagado._sum.monto_pagado || 0);
    await tx.prestamos.update({
      where: { id: parseInt(prestamoId) },
      data: { saldo_actual: nuevoSaldo > 0 ? nuevoSaldo : 0 }
    });

    const cuotasPendientes = await tx.cuotas.count({
      where: { prestamo_id: parseInt(prestamoId), estado: { not: 'pagado' } }
    });

    if (cuotasPendientes === 0) {
      await tx.prestamos.update({
        where: { id: parseInt(prestamoId) },
        data: { estado: 'pagado' }
      });
    }

    return { success: true, message: 'Pago registrado exitosamente' };
  });
}

async function actualizarEstadoPrestamo(id, estado) {
  const estadosValidos = ['pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado', 'cancelado'];
  if (!estadosValidos.includes(estado)) {
    throw new Error(`Estado inválido. Válidos: ${estadosValidos.join(', ')}`);
  }

  return await prisma.prestamos.update({
    where: { id: parseInt(id) },
    data: { estado }
  });
}

module.exports = {
  listarPrestamos,
  obtenerPrestamoPorId,
  crearPrestamo,
  actualizarPrestamo,
  eliminarPrestamo,
  registrarPago,
  actualizarEstadoPrestamo
};
