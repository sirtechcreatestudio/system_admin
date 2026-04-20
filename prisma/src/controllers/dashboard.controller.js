const service = require("../services/dashboard.service");

exports.getDashboard = async (req, res, next) => {
  try {
    const data = await service.getDashboard();
    
    res.json({
      success: true,
      data: {
        clientes: data.clientes || 0,
        prestamos: data.prestamosActivos || 0,
        totalPrestado: data.cartera || data.totalPrestado || 0, // Usar cartera primero
        morosos: data.morosos || 0,
        cobrosHoy: data.ingresos?.hoy || 0,
        vencenHoy: data.vencenHoy || 0,
        tasaRecuperacion: data.tasaRecuperacion || 0,
        ingresosPorDia: data.graficas?.ingresos_por_dia || [],
        topMorosos: data.top_morosos || []
      }
    });
  } catch (err) {
    next(err);
  }
};