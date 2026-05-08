'use strict';

// src/services/financiamiento.service.js
const prisma = require('../lib/prisma');

// ─── Generar número de contrato único ────────────────────────────────────────
async function generarNumeroContrato() {
  const year = new Date().getFullYear();
  const ultimo = await prisma.financiamientos.findFirst({
    where: { numero_contrato: { startsWith: `FCA-${year}-` } },
    orderBy: { id: 'desc' },
    select: { numero_contrato: true },
  });

  let siguiente = 1;
  if (ultimo) {
    const partes = ultimo.numero_contrato.split('-');
    siguiente = parseInt(partes[2]) + 1;
  }

  return `FCA-${year}-${String(siguiente).padStart(4, '0')}`;
}

// ─── Calcular amortización (fuente de verdad en el backend) ──────────────────
function calcularAmortizacion({ monto, tasa, numCuotas, fechaInicio, frecuencia }) {
  const cuotas = [];
  let saldo = parseFloat(monto);
  const tasaMensual = parseFloat(tasa) / 100;
  let montoCuota;

  if (!tasaMensual || tasaMensual === 0) {
    montoCuota = saldo / numCuotas;
  } else {
    montoCuota =
      (saldo * (tasaMensual * Math.pow(1 + tasaMensual, numCuotas))) /
      (Math.pow(1 + tasaMensual, numCuotas) - 1);
  }

  const diasPorFrecuencia = { semanal: 7, quincenal: 15, mensual: 30 };
  const dias = diasPorFrecuencia[frecuencia] || 30;
  let fecha = new Date(fechaInicio);

  for (let i = 1; i <= numCuotas; i++) {
    fecha = new Date(fecha);
    fecha.setDate(fecha.getDate() + dias);

    const interes  = saldo * tasaMensual;
    const capital  = montoCuota - interes;
    saldo          = Math.max(0, saldo - capital);

    cuotas.push({
      numero         : i,
      fechaPago      : fecha.toISOString().split('T')[0],
      capital        : parseFloat(capital.toFixed(2)),
      interes        : parseFloat(interes.toFixed(2)),
      montoCuota     : parseFloat(montoCuota.toFixed(2)),
      saldoRestante  : parseFloat(saldo.toFixed(2)),
      estado         : 'pendiente',
    });
  }

  if (cuotas.length > 0) cuotas[cuotas.length - 1].saldoRestante = 0;
  return cuotas;
}

// ─── Formatear BD → camelCase para el frontend ───────────────────────────────
function formatear(f) {
  return {
    id              : f.id,
    numeroContrato  : f.numero_contrato,
    estado          : f.estado,
    fechaCreacion   : f.fecha_creacion.toISOString(),
    fechaContrato   : f.fecha_contrato.toISOString().split('T')[0],
    cliente         : f.cliente,
    garante         : f.garante,
    vehiculo        : f.vehiculo,
    prestamo        : f.prestamo,
    terminosLegales : f.terminos_legales,
    notario         : f.notario,
    amortizacion    : f.amortizacion,
    vendedor        : f.vendedor,
    createdBy       : f.created_by,
  };
}

// ─── LISTAR con filtros y paginación ─────────────────────────────────────────
async function listar({ estado, vendedor, busqueda, page = 1, limit = 50 } = {}) {
  const where = { deleted_at: null };

  if (estado)   where.estado   = estado;
  if (vendedor) where.vendedor = { contains: vendedor, mode: 'insensitive' };

  // Búsqueda por número de contrato (los campos JSON no son filtrables con Prisma ORM)
  if (busqueda) {
    where.numero_contrato = { contains: busqueda.toUpperCase(), mode: 'insensitive' };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [total, registros] = await Promise.all([
    prisma.financiamientos.count({ where }),
    prisma.financiamientos.findMany({
      where,
      orderBy : { fecha_creacion: 'desc' },
      skip,
      take    : parseInt(limit),
    }),
  ]);

  return {
    data       : registros.map(formatear),
    total,
    page       : parseInt(page),
    totalPages : Math.ceil(total / parseInt(limit)),
  };
}

// ─── OBTENER POR ID ───────────────────────────────────────────────────────────
async function obtenerPorId(id) {
  const f = await prisma.financiamientos.findFirst({
    where: { id: parseInt(id), deleted_at: null },
  });
  return f ? formatear(f) : null;
}

// ─── CREAR ────────────────────────────────────────────────────────────────────
async function crear(datos, usuarioId) {
  const { cliente, garante, vehiculo, prestamo, terminosLegales, notario, fechaContrato, vendedor } = datos;

  const amortizacion = calcularAmortizacion({
    monto      : prestamo.montoFinanciar,
    tasa       : prestamo.tasaInteres,
    numCuotas  : prestamo.numeroCuotas,
    fechaInicio: prestamo.fechaInicio,
    frecuencia : prestamo.frecuencia,
  });

  const numeroContrato = await generarNumeroContrato();

  const nuevo = await prisma.financiamientos.create({
    data: {
      numero_contrato  : numeroContrato,
      estado           : 'activo',
      fecha_contrato   : new Date(fechaContrato),
      cliente,
      garante,
      vehiculo,
      prestamo,
      terminos_legales : terminosLegales,
      notario,
      amortizacion,
      vendedor,
      created_by       : usuarioId || null,
    },
  });

  return formatear(nuevo);
}

// ─── ACTUALIZAR (estado o amortización) ──────────────────────────────────────
async function actualizar(id, datos) {
  const existe = await prisma.financiamientos.findFirst({
    where: { id: parseInt(id), deleted_at: null },
  });
  if (!existe) return null;

  const dataUpdate = {};
  if (datos.estado)       dataUpdate.estado       = datos.estado;
  if (datos.amortizacion) dataUpdate.amortizacion = datos.amortizacion;
  if (datos.terminosLegales) dataUpdate.terminos_legales = datos.terminosLegales;

  const actualizado = await prisma.financiamientos.update({
    where: { id: parseInt(id) },
    data : dataUpdate,
  });

  return formatear(actualizado);
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────
async function eliminar(id) {
  const existe = await prisma.financiamientos.findFirst({
    where: { id: parseInt(id), deleted_at: null },
  });
  if (!existe) return false;

  await prisma.financiamientos.update({
    where: { id: parseInt(id) },
    data : { deleted_at: new Date() },
  });

  return true;
}

// ─── STATS para dashboard ─────────────────────────────────────────────────────
async function obtenerStats() {
  const [total, activos, pagados, atrasados, sumaRaw] = await Promise.all([
    prisma.financiamientos.count({ where: { deleted_at: null } }),
    prisma.financiamientos.count({ where: { estado: 'activo',   deleted_at: null } }),
    prisma.financiamientos.count({ where: { estado: 'pagado',   deleted_at: null } }),
    prisma.financiamientos.count({ where: { estado: 'atrasado', deleted_at: null } }),
    // Suma del campo JSON prestamo->montoFinanciar usando raw SQL de PostgreSQL
    prisma.$queryRaw`
      SELECT COALESCE(SUM((prestamo->>'montoFinanciar')::numeric), 0)::float AS total
      FROM financiamientos
      WHERE deleted_at IS NULL
    `,
  ]);

  return {
    total,
    activos,
    pagados,
    atrasados,
    totalFinanciado: parseFloat(sumaRaw[0]?.total || 0),
  };
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, obtenerStats };