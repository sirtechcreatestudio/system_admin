// src/services/prestamo.service.js
// Corregido: usa el schema real (sin created_by, sin tipo_prestamo_id directo,
// sin cuota_id en amortizacion — usa connect/relaciones para FK)
const prisma = require('../config/prisma');

function calcularCuota(monto, interes, plazo) {
  if (!monto || !interes || !plazo || plazo === 0) return 0;
  const r = interes / 100 / 12;
  if (r === 0) return monto / plazo;
  const cuota = monto * (r * Math.pow(1 + r, plazo)) / (Math.pow(1 + r, plazo) - 1);
  return parseFloat(cuota.toFixed(2));
}

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
    cuota_mensual: calcularCuota(Number(p.monto), Number(p.interes), p.plazo)
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
    cuota_mensual: calcularCuota(Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo)
  };
};

exports.crearPrestamoCompleto = async (data) => {
  const { cliente_id, monto, interes, plazo, tipo_prestamo_id, plan_pago_id, fecha_inicio } = data;

  const montoN  = parseFloat(monto);
  const interesN = parseFloat(interes);
  const plazoN  = parseInt(plazo);
  const cuotaMensual = calcularCuota(montoN, interesN, plazoN);

  return await prisma.$transaction(async (tx) => {
    // Construir data con connect para relaciones — nunca IDs directos en Prisma relations
    const createData = {
      clientes:    { connect: { id: parseInt(cliente_id) } },
      monto:       montoN,
      interes:     interesN,
      plazo:       plazoN,
      estado:      'pendiente',
      fecha_inicio: fecha_inicio ? new Date(fecha_inicio) : new Date()
    };

    if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
      createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
    }
    if (plan_pago_id && parseInt(plan_pago_id) > 0) {
      createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
    }

    const prestamo = await tx.prestamos.create({ data: createData });

    let saldo = montoN;
    const tasa = interesN / 100 / 12;

    for (let i = 1; i <= plazoN; i++) {
      const interesCuota = saldo * tasa;
      const capital = cuotaMensual - interesCuota;
      saldo = Math.max(saldo - capital, 0);

      const fechaVenc = new Date(prestamo.fecha_inicio);
      fechaVenc.setMonth(fechaVenc.getMonth() + i);

      await tx.cuotas.create({
        data: {
          prestamo_id:       prestamo.id,
          numero:            i,
          monto:             cuotaMensual,
          fecha_vencimiento: fechaVenc,
          estado:            'pendiente'
        }
      });

      // amortizacion NO tiene cuota_id en el schema — solo prestamo_id
      await tx.amortizacion.create({
        data: {
          prestamo_id:    prestamo.id,
          numero_cuota:   i,
          capital:        Math.round(capital * 100) / 100,
          interes:        Math.round(interesCuota * 100) / 100,
          saldo_restante: Math.round(saldo * 100) / 100,
          fecha_pago:     fechaVenc,
          estado:         'pendiente'
        }
      });
    }

    return prestamo;
  });
};

exports.actualizarPrestamo = async (id, data) => {
  const updateData = {
    estado:       data.estado,
    monto:        data.monto  ? parseFloat(data.monto)  : undefined,
    interes:      data.interes ? parseFloat(data.interes) : undefined,
    plazo:        data.plazo  ? parseInt(data.plazo)   : undefined,
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
