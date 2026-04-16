// src/services/caja.service.js
const prisma = require("../config/prisma");

exports.abrirCaja = async (userId) => {

  // verificar si ya tiene caja abierta
  const cajaAbierta = await prisma.caja.findFirst({
    where: {
      usuario_id: userId,
      estado: "abierta"
    }
  });

  if (cajaAbierta) {
    throw new Error("Ya tienes una caja abierta");
  }

  const caja = await prisma.caja.create({
    data: {
      usuario_id: userId,
      fecha_apertura: new Date(),
      estado: "abierta"
    }
  });

  return caja;
};

exports.cerrarCaja = async (cajaId, userId) => {

  const caja = await prisma.caja.findUnique({
    where: { id: cajaId }
  });

  if (!caja || caja.estado !== "abierta") {
    throw new Error("Caja no válida");
  }

  // calcular total ingresos
  const ingresos = await prisma.movimientos_caja.aggregate({
    _sum: { monto: true },
    where: {
      caja_id: cajaId,
      tipo: "ingreso"
    }
  });

  // calcular egresos
  const egresos = await prisma.movimientos_caja.aggregate({
    _sum: { monto: true },
    where: {
      caja_id: cajaId,
      tipo: "egreso"
    }
  });

  const totalIngresos = ingresos._sum.monto || 0;
  const totalEgresos = egresos._sum.monto || 0;

  const cajaCerrada = await prisma.caja.update({
    where: { id: cajaId },
    data: {
      estado: "cerrada",
      fecha_cierre: new Date()
    }
  });

  // auditoría
  await prisma.logs_auditoria.create({
    data: {
      usuario_id: userId,
      accion: "CIERRE_CAJA",
      tabla_afectada: "caja",
      registro_id: cajaId
    }
  });

  return {
    caja: cajaCerrada,
    resumen: {
      ingresos: totalIngresos,
      egresos: totalEgresos,
      balance: totalIngresos - totalEgresos
    }
  };
};

exports.getCajaActual = async (userId) => {
  return await prisma.caja.findFirst({
    where: {
      usuario_id: userId,
      estado: "abierta"
    },
    include: {
      movimientos: true
    }
  });
};

exports.registrarMovimiento = async (data) => {
  return await prisma.movimientos_caja.create({
    data
  });
};

exports.reporteCaja = async (cajaId) => {

  const movimientos = await prisma.movimientos_caja.findMany({
    where: { caja_id: cajaId },
    orderBy: { fecha: 'asc' }
  });

  const ingresos = movimientos
    .filter(m => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);

  const egresos = movimientos
    .filter(m => m.tipo === "egreso")
    .reduce((acc, m) => acc + m.monto, 0);

  return {
    movimientos,
    resumen: {
      ingresos,
      egresos,
      balance: ingresos - egresos
    }
  };
};