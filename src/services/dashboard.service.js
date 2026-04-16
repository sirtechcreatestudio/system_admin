const prisma = require('../config/database');

exports.getDashboard = async () => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  const finHoy = new Date(hoy);
  finHoy.setHours(23, 59, 59, 999);
  
  const hace30Dias = new Date(hoy);
  hace30Dias.setDate(hace30Dias.getDate() - 30);
  hace30Dias.setHours(0, 0, 0, 0);

  console.log('📅 Hoy:', hoy.toISOString(), 'Fin hoy:', finHoy.toISOString());

  // Ejecutar todas las consultas en paralelo
  const [
    totalClientes,
    prestamosActivos,
    carteraTotal,
    totalPrestadoHistorico,
    morososCount,
    cobrosHoy,
    vencenHoyCount,
    ingresosUltimos30Dias,
    topMorososData
  ] = await Promise.all([
    
    // 1. Total de clientes activos
    prisma.clientes.count({
      where: { estado: 'activo' }
    }),

    // 2. Préstamos activos
    prisma.prestamos.count({
      where: {
        estado: { in: ['activo', 'atrasado'] },
        deleted_at: null
      }
    }),

    // 3. Cartera total (saldo_actual de préstamos activos)
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
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT cliente_id) as count
      FROM prestamos
      WHERE (estado = 'atrasado' OR tiene_mora = true)
        AND deleted_at IS NULL
        AND cliente_id IS NOT NULL
    `,

    // 6. Cobros de hoy - CORREGIDO
    prisma.$queryRaw`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE DATE(fecha_pago) = CURDATE()
        AND deleted_at IS NULL
    `,

    // 7. Cuotas que vencen hoy
    prisma.cuotas.count({
      where: {
        fecha_vencimiento: {
          gte: hoy,
          lte: finHoy
        },
        estado: { in: ['pendiente', 'atrasado'] }
      }
    }),

    // 8. Ingresos últimos 30 días - CORREGIDO con SQL directo
    prisma.$queryRaw`
      SELECT 
        DATE(fecha_pago) as fecha_pago,
        COALESCE(SUM(monto), 0) as monto
      FROM pagos
      WHERE fecha_pago >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND deleted_at IS NULL
      GROUP BY DATE(fecha_pago)
      ORDER BY fecha_pago ASC
    `,

    // 9. Top morosos
    prisma.prestamos.findMany({
      where: {
        OR: [
          { estado: 'atrasado' },
          { tiene_mora: true }
        ],
        deleted_at: null,
        total_mora: { gt: 0 }
      },
      select: {
        id: true,
        cliente_id: true,
        total_mora: true,
        clientes: {
          select: {
            nombre: true,
            cedula: true
          }
        }
      },
      orderBy: { total_mora: 'desc' },
      take: 5
    })
  ]);

  // Extraer valores
  const morosos = Number(morososCount[0]?.count || 0);
  const cobrosHoyMonto = Number(cobrosHoy[0]?.total || 0);
  
  const totalPrestado = Number(totalPrestadoHistorico._sum.monto || 0);
  const cartera = Number(carteraTotal._sum.saldo_actual || 0);

  console.log('💰 Cobros hoy:', cobrosHoyMonto);
  console.log('📊 Ingresos 30 días:', ingresosUltimos30Dias.length, 'registros');

  // Calcular tasa de recuperación
  const totalCobrado = await prisma.pagos.aggregate({
    where: { deleted_at: null },
    _sum: { monto: true }
  });

  const tasaRecuperacion = totalPrestado > 0
    ? Math.round((Number(totalCobrado._sum.monto || 0) / totalPrestado) * 100)
    : 0;

  // Formatear ingresos por día
  const ingresosPorDia = ingresosUltimos30Dias.map(item => ({
    fecha_pago: item.fecha_pago instanceof Date 
      ? item.fecha_pago.toISOString().split('T')[0]
      : item.fecha_pago,
    _sum: { monto: Number(item.monto || 0) }
  }));

  // Formatear top morosos
  const topMorosos = topMorososData.map(item => ({
    id: item.id,
    nombre: item.clientes?.nombre || 'Desconocido',
    cedula: item.clientes?.cedula || '—',
    total_mora: Number(item.total_mora || 0)
  }));

  return {
    clientes: totalClientes,
    prestamosActivos,
    cartera: cartera || totalPrestado,
    totalPrestado,
    morosos,
    vencenHoy: vencenHoyCount,
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