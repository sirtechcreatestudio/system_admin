// src/services/morosos.service.js
const prisma = require("../config/prisma");

exports.getMorososAvanzado = async () => {

  // =========================
  // 🔍 PRÉSTAMOS CON MORA
  // =========================
  const prestamos = await prisma.prestamos.findMany({
    where: {
      tiene_mora: true
    },
    include: {
      cliente: true,
      moras: {
        where: { estado: "activa" }
      },
      cuotas: {
        where: { estado: "atrasado" }
      }
    }
  });

  // =========================
  // 🧠 PROCESAR DATA
  // =========================
  const resultado = prestamos.map(p => {

    const totalMora = p.moras.reduce((acc, m) => acc + m.monto, 0);

    const deudaCuotas = p.cuotas.reduce((acc, c) => acc + c.monto, 0);

    const totalDeuda = totalMora + deudaCuotas;

    const diasAtraso = Math.max(
      ...p.moras.map(m => m.dias_atraso),
      0
    );

    // 🔥 SCORE DE RIESGO
    let riesgo = "bajo";

    if (totalDeuda > 50000 || diasAtraso > 30) {
      riesgo = "alto";
    } else if (totalDeuda > 20000 || diasAtraso > 15) {
      riesgo = "medio";
    }

    return {
      cliente: {
        id: p.cliente.id,
        nombre: p.cliente.nombre,
        telefono: p.cliente.telefono
      },
      prestamo_id: p.id,
      deuda: {
        mora: totalMora,
        cuotas: deudaCuotas,
        total: totalDeuda
      },
      atraso: {
        dias: diasAtraso,
        cuotas_vencidas: p.cuotas.length
      },
      riesgo,
      prioridad: totalDeuda + (diasAtraso * 100) // 🔥 ranking inteligente
    };
  });

  // =========================
  // 🔥 ORDENAR POR PRIORIDAD
  // =========================
  return resultado.sort((a, b) => b.prioridad - a.prioridad);
};