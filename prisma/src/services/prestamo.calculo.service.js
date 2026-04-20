// src/services/prestamo.calculo.service.js
// Corregido: sin sistema_calculo, sin saldo_actual, sin frecuencia_pago
// Solo usa campos reales del schema
const prisma = require('../config/prisma');

class PrestamoCalculoService {
  calcularCuota(monto, interesAnual, plazo) {
    if (!monto || !interesAnual || !plazo) return 0;
    const tasa = interesAnual / 100 / 12;
    if (tasa === 0) return monto / plazo;
    return Math.round(monto * (tasa * Math.pow(1 + tasa, plazo)) / (Math.pow(1 + tasa, plazo) - 1) * 100) / 100;
  }

  async calcularSaldoActual(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        pagos: { orderBy: { fecha_pago: 'desc' } },
        cuotas: { where: { estado: 'pagado' } }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const montoOriginal = Number(prestamo.monto);
    const cuotaMensual  = this.calcularCuota(montoOriginal, Number(prestamo.interes), prestamo.plazo);
    const tasa          = Number(prestamo.interes) / 100 / 12;

    // Recalcular saldo recorriendo cuotas pagadas
    let saldo = montoOriginal;
    const cuotasPagadas = prestamo.cuotas.length;

    for (let i = 0; i < cuotasPagadas; i++) {
      const interesCuota = saldo * tasa;
      const capital      = cuotaMensual - interesCuota;
      saldo = Math.max(saldo - capital, 0);
    }
    return Math.round(saldo * 100) / 100;
  }

  async obtenerResumenPrestamo(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        cuotas:    { orderBy: { numero: 'asc' } },
        pagos:     { orderBy: { fecha_pago: 'desc' } },
        moras:     { where: { estado: 'activa' } }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const cuotaMensual = this.calcularCuota(Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo);
    const cuotasPagadas   = prestamo.cuotas.filter(c => c.estado === 'pagado').length;
    const cuotasPendientes = prestamo.cuotas.filter(c => c.estado === 'pendiente').length;
    const cuotasAtrasadas = prestamo.cuotas.filter(c => c.estado === 'atrasado').length;
    const totalMora       = prestamo.moras.reduce((s, m) => s + Number(m.monto || 0), 0);
    const saldoActual     = await this.calcularSaldoActual(prestamoId);

    return {
      prestamo_id:       prestamo.id,
      monto_original:    Number(prestamo.monto),
      saldo_actual:      saldoActual,
      cuota_mensual:     cuotaMensual,
      cuotas_pagadas:    cuotasPagadas,
      cuotas_pendientes: cuotasPendientes,
      cuotas_atrasadas:  cuotasAtrasadas,
      total_mora:        totalMora,
      porcentaje_avance: prestamo.plazo > 0 ? Math.round((cuotasPagadas / prestamo.plazo) * 100) : 0
    };
  }
}

module.exports = new PrestamoCalculoService();
