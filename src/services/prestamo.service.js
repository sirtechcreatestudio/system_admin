// src/services/prestamo.service.js
const prisma = require('../config/prisma');

// -------------------------------------------------------
// Helpers de frecuencia
// -------------------------------------------------------

function tasaPorFrecuencia(interesAnual, frecuencia) {
  const anual = interesAnual / 100;
  switch (frecuencia) {
    case 'diaria':     return anual / 365;
    case 'semanal':    return anual / 52;
    case 'quincenal':  return anual / 24;
    case 'mensual':
    default:           return anual / 12;
  }
}

function calcularCuotaFrecuencia(monto, interesAnual, plazo, frecuencia = 'mensual') {
  if (!monto || !interesAnual || !plazo || plazo === 0) return 0;
  const r = tasaPorFrecuencia(interesAnual, frecuencia);
  if (r === 0) return parseFloat((monto / plazo).toFixed(2));
  const cuota = monto * (r * Math.pow(1 + r, plazo)) / (Math.pow(1 + r, plazo) - 1);
  return parseFloat(cuota.toFixed(2));
}

function sumarPeriodo(fecha, n, frecuencia) {
  const d = new Date(fecha);
  switch (frecuencia) {
    case 'diaria':
      d.setDate(d.getDate() + n);
      break;
    case 'semanal':
      d.setDate(d.getDate() + n * 7);
      break;
    case 'quincenal':
      d.setDate(d.getDate() + n * 15);
      break;
    case 'mensual':
    default:
      d.setMonth(d.getMonth() + n);
  }
  return d;
}

// Normalizar frecuencia: el frontend Vue usa 'diario', el service usa 'diaria'
function normalizarFrecuencia(frecuencia) {
  if (frecuencia === 'diario') return 'diaria';
  return frecuencia || 'mensual';
}

function calcularCuota(monto, interes, plazo) {
  return calcularCuotaFrecuencia(monto, interes, plazo, 'mensual');
}

// -------------------------------------------------------
// Exports
// -------------------------------------------------------

exports.listarPrestamos = async () => {
  const prestamos = await prisma.prestamos.findMany({
    include: {
      clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true } }
    },
    orderBy: { created_at: 'desc' }
  });
  return prestamos.map(p => ({
    ...p,
    cliente: p.clientes,
    saldo_actual: Number(p.saldo_actual ?? p.monto),
    cuota_calculada: calcularCuotaFrecuencia(
      Number(p.monto), Number(p.interes), p.plazo, normalizarFrecuencia(p.frecuencia_pago)
    )
  }));
};

exports.obtenerPrestamoPorId = async (id) => {
  const prestamo = await prisma.prestamos.findUnique({
    where: { id: parseInt(id) },
    include: {
      clientes: true,
      cuotas:       { orderBy: { numero: 'asc' } },
      amortizacion: { orderBy: { numero_cuota: 'asc' } }
    }
  });
  if (!prestamo) throw new Error('Préstamo no encontrado');
  return {
    ...prestamo,
    cliente: prestamo.clientes,
    saldo_actual: Number(prestamo.saldo_actual ?? prestamo.monto),
    cuota_calculada: calcularCuotaFrecuencia(
      Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo,
      normalizarFrecuencia(prestamo.frecuencia_pago)
    )
  };
};

exports.crearPrestamoCompleto = async (data) => {
  const {
    cliente_id, monto, interes, plazo,
    tipo_prestamo_id, plan_pago_id,
    fecha_inicio,
    frecuencia_pago = 'mensual'
  } = data;

  // Normalizar 'diario' → 'diaria' (frontend Vue usa 'diario')
  const frecNorm = normalizarFrecuencia(frecuencia_pago);
  const frecuencias = ['diaria', 'semanal', 'quincenal', 'mensual'];
  if (!frecuencias.includes(frecNorm)) {
    throw new Error(`Frecuencia inválida. Use: ${frecuencias.join(', ')}`);
  }

  const montoN        = parseFloat(monto);
  const interesN      = parseFloat(interes);
  const plazoN        = parseInt(plazo);
  const plazoOriginalN = plazoN;

  const cuota = calcularCuotaFrecuencia(montoN, interesN, plazoN, frecNorm);
  const tasa  = tasaPorFrecuencia(interesN, frecNorm);

  const fechaBase = fecha_inicio ? new Date(fecha_inicio) : new Date();

  return await prisma.$transaction(async (tx) => {
    const createData = {
      clientes:        { connect: { id: parseInt(cliente_id) } },
      monto:           montoN,
      interes:         interesN,
      plazo:           plazoN,
      plazo_original:  plazoOriginalN,
      frecuencia_pago: frecNorm,
      estado:          'pendiente',
      fecha_inicio:    fechaBase,
      saldo_actual:    montoN
    };

    if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
      createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
    }
    if (plan_pago_id && parseInt(plan_pago_id) > 0) {
      createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
    }

    const prestamo = await tx.prestamos.create({ data: createData });

    // ✅ FIX: Calcular todos los datos en memoria primero (sin awaits en loop)
    // luego insertar en batch con createMany — evita Transaction timeout en Neon serverless
    const cuotasData       = [];
    const amortizacionData = [];
    let saldo = montoN;

    for (let i = 1; i <= plazoN; i++) {
      const interesCuota = saldo * tasa;
      const capital      = cuota - interesCuota;
      saldo = Math.max(saldo - capital, 0);
      const fechaVenc = sumarPeriodo(fechaBase, i, frecNorm);

      cuotasData.push({
        prestamo_id:       prestamo.id,
        numero:            i,
        monto:             cuota,
        fecha_vencimiento: fechaVenc,
        estado:            'pendiente'
      });

      amortizacionData.push({
        prestamo_id:    prestamo.id,
        numero_cuota:   i,
        capital:        parseFloat(capital.toFixed(2)),
        interes:        parseFloat(interesCuota.toFixed(2)),
        saldo_restante: parseFloat(saldo.toFixed(2)),
        fecha_pago:     fechaVenc,
        estado:         'pendiente'
      });
    }

    // 2 inserciones batch en vez de N*2 queries individuales
    await tx.cuotas.createMany({ data: cuotasData });
    await tx.amortizacion.createMany({ data: amortizacionData });

    return {
      ...prestamo,
      cuota_calculada: cuota,
      frecuencia_pago: frecNorm
    };
  }, {
    maxWait: 10000,  // 10s para obtener conexión
    timeout:  30000  // 30s para completar la transacción
  });
};

exports.actualizarPrestamo = async (id, data) => {
  const updateData = {
    estado:       data.estado,
    monto:        data.monto   ? parseFloat(data.monto)   : undefined,
    interes:      data.interes ? parseFloat(data.interes)  : undefined,
    plazo:        data.plazo   ? parseInt(data.plazo)      : undefined,
    fecha_inicio: data.fecha_inicio ? new Date(data.fecha_inicio) : undefined
  };
  if (data.tipo_prestamo_id && parseInt(data.tipo_prestamo_id) > 0) {
    updateData.tipos_prestamo = { connect: { id: parseInt(data.tipo_prestamo_id) } };
  }
  if (data.plan_pago_id && parseInt(data.plan_pago_id) > 0) {
    updateData.planes_pago = { connect: { id: parseInt(data.plan_pago_id) } };
  }
  return await prisma.prestamos.update({ where: { id: parseInt(id) }, data: updateData });
};

exports.eliminarPrestamo = async (id) => {
  await prisma.prestamos.delete({ where: { id: parseInt(id) } });
  return true;
};
