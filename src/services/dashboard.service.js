// src/services/dashboard.service.js
// ✅ Migrado de MySQL a PostgreSQL
// Cambios clave:
//   CURDATE()                          → CURRENT_DATE
//   DATE(campo)                        → campo::date
//   DATE_SUB(CURDATE(), INTERVAL N DAY)→ CURRENT_DATE - INTERVAL 'N days'
//   COUNT() de $queryRaw devuelve BigInt → Number(x) explícito

const prisma = require('../config/prisma');

exports.getDashboard = async () => {

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const finHoy = new Date(hoy);
  finHoy.setHours(23, 59, 59, 999);

  const [
    totalClientes,
    prestamosActivos,
    carteraTotal,
    totalPrestadoHistorico,
    morososCount,
    cobrosHoy,
    vencenHoyCount,
    ingresosUltimos30Dias,
    topMorososData,
    totalCobrado
  ] = await Promise.all([

    // 1. Total clientes activos
    prisma.clientes.count({
      where: { estado: 'activo' }
    }),

    // 2. Préstamos activos o atrasados
    prisma.prestamos.count({
      where: {
        estado: { in: ['activo', 'atrasado'] },
        deleted_at: null
      }
    }),

    // 3. Cartera total (saldo actual de préstamos vigentes)
    prisma.prestamos.aggregate({
      where: {
        estado: { in: ['activo', 'atrasado'] },
        deleted_at: null
      },
      _sum: { saldo_actual: true }
    }),

    // 4. Total prestado histórico
    prisma.prestamos.aggregate({
      where: { deleted_at: null },
      _sum: { monto: true }
    }),

    // 5. Clientes en mora
    // PG: no usa CURDATE(), usa comparación directa con Prisma
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT cliente_id)::int AS count
      FROM prestamos
      WHERE (estado = 'atrasado' OR tiene_mora = true)
        AND deleted_at IS NULL
        AND cliente_id IS NOT NULL
    `,

    // 6. Cobros de hoy
    // PG: fecha_pago::date = CURRENT_DATE  (en vez de DATE(campo) = CURDATE())
    prisma.$queryRaw`
      SELECT COALESCE(SUM(monto), 0)::float AS total
      FROM pagos
      WHERE fecha_pago::date = CURRENT_DATE
        AND deleted_at IS NULL
    `,

    // 7. Cuotas que vencen hoy
    prisma.cuotas.count({
      where: {
        fecha_vencimiento: { gte: hoy, lte: finHoy },
        estado: { in: ['pendiente', 'atrasado'] }
      }
    }),

    // 8. Ingresos por día — últimos 30 días
    // PG: CURRENT_DATE - INTERVAL '30 days'  (en vez de DATE_SUB(CURDATE(), INTERVAL 30 DAY))
    //     fecha_pago::date                    (en vez de DATE(fecha_pago))
    prisma.$queryRaw`
      SELECT
        fecha_pago::date        AS fecha_pago,
        COALESCE(SUM(monto), 0)::float AS monto
      FROM pagos
      WHERE fecha_pago::date >= CURRENT_DATE - INTERVAL '30 days'
        AND deleted_at IS NULL
      GROUP BY fecha_pago::date
      ORDER BY fecha_pago::date ASC
    `,

    // 9. Top morosos (5 con mayor mora)
    prisma.prestamos.findMany({
      where: {
        OR: [{ estado: 'atrasado' }, { tiene_mora: true }],
        deleted_at: null,
        total_mora: { gt: 0 }
      },
      select: {
        id: true,
        cliente_id: true,
        total_mora: true,
        clientes: {
          select: { nombre: true, cedula: true }
        }
      },
      orderBy: { total_mora: 'desc' },
      take: 5
    }),

    // 10. Total cobrado histórico (para tasa de recuperación)
    prisma.pagos.aggregate({
      where: { deleted_at: null },
      _sum: { monto: true }
    })
  ]);

  // ─── Extraer valores seguros ─────────────────────────────────
  // BigInt → Number en resultados de $queryRaw
  const morosos        = Number(morososCount[0]?.count ?? 0);
  const cobrosHoyMonto = Number(cobrosHoy[0]?.total ?? 0);
  const cartera        = Number(carteraTotal._sum.saldo_actual ?? 0);
  const totalPrestado  = Number(totalPrestadoHistorico._sum.monto ?? 0);
  const totalCobradoNum = Number(totalCobrado._sum.monto ?? 0);

  // Tasa de recuperación
  const tasaRecuperacion = totalPrestado > 0
    ? Math.round((totalCobradoNum / totalPrestado) * 100)
    : 0;

  // Normalizar ingresos por día
  const ingresosPorDia = ingresosUltimos30Dias.map(item => ({
    fecha_pago: item.fecha_pago instanceof Date
      ? item.fecha_pago.toISOString().split('T')[0]
      : String(item.fecha_pago),
    _sum: { monto: Number(item.monto ?? 0) }
  }));

  // Normalizar top morosos
  const topMorosos = topMorososData.map(p => ({
    id:         p.id,
    nombre:     p.clientes?.nombre ?? 'Desconocido',
    cedula:     p.clientes?.cedula ?? '—',
    total_mora: Number(p.total_mora ?? 0)
  }));

  return {
    clientes:          totalClientes,
    prestamosActivos,
    cartera:           cartera || totalPrestado,
    totalPrestado,
    morosos,
    vencenHoy:         vencenHoyCount,
    tasaRecuperacion,
    ingresos: {
      hoy: cobrosHoyMonto
    },
    graficas: {
      ingresos_por_dia: ingresosPorDia
    },
    top_morosos: topMorosos
  };
};