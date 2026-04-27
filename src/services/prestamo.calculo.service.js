// src/services/prestamo.calculo.service.js
// CORRECCIÓN: calcularSaldoActual lee directamente prestamos.saldo_actual
// (que se actualiza en cada pago), NO recalcula desde cuotas pagadas.
// Eso eliminaba el bug donde pagar 6000 de 12000 cerraba el préstamo.

const prisma = require('../config/prisma');

class PrestamoCalculoService {

  calcularCuota(monto, interesAnual, plazo, frecuencia = 'mensual') {
    if (!monto || !interesAnual || !plazo) return 0;
    const tasa = this._tasaPorFrecuencia(interesAnual, frecuencia);
    if (tasa === 0) return parseFloat((monto / plazo).toFixed(2));
    const c = monto * (tasa * Math.pow(1 + tasa, plazo)) / (Math.pow(1 + tasa, plazo) - 1);
    return parseFloat(c.toFixed(2));
  }

  _tasaPorFrecuencia(interesAnual, frecuencia) {
    const anual = interesAnual / 100;
    switch (frecuencia) {
      case 'diaria':    return anual / 365;
      case 'semanal':   return anual / 52;
      case 'quincenal': return anual / 24;
      default:          return anual / 12;
    }
  }

  /**
   * Retorna el saldo actual del préstamo desde la columna saldo_actual.
   * Si por alguna razón saldo_actual es null (préstamos anteriores a la migración),
   * hace un recálculo de emergencia y lo persiste.
   */
  async calcularSaldoActual(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        cuotas: { where: { estado: 'pagado' } }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');

    // Si ya tenemos saldo_actual confiable, usarlo directamente
    if (prestamo.saldo_actual !== null && prestamo.saldo_actual !== undefined) {
      return Math.max(Number(prestamo.saldo_actual), 0);
    }

    // Fallback: recalcular desde amortización para préstamos legacy sin saldo_actual
    const frecuencia = prestamo.frecuencia_pago || 'mensual';
    const tasa = this._tasaPorFrecuencia(Number(prestamo.interes), frecuencia);
    const cuotaMensual = this.calcularCuota(
      Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo, frecuencia
    );

    let saldo = Number(prestamo.monto);
    const cuotasPagadas = prestamo.cuotas.length;

    for (let i = 0; i < cuotasPagadas; i++) {
      const interesCuota = saldo * tasa;
      const capital = cuotaMensual - interesCuota;
      saldo = Math.max(saldo - capital, 0);
    }

    const saldoCalculado = parseFloat(saldo.toFixed(2));

    // Persistir para próximas consultas
    await prisma.prestamos.update({
      where: { id: parseInt(prestamoId) },
      data: { saldo_actual: saldoCalculado }
    });

    return saldoCalculado;
  }

  async obtenerResumenPrestamo(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        cuotas: { orderBy: { numero: 'asc' } },
        pagos:  { orderBy: { fecha_pago: 'desc' } },
        moras:  { where: { estado: 'activa' } }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const frecuencia = prestamo.frecuencia_pago || 'mensual';
    const cuotaCalculada = this.calcularCuota(
      Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo, frecuencia
    );

    const cuotasPagadas    = prestamo.cuotas.filter(c => c.estado === 'pagado').length;
    const cuotasPendientes = prestamo.cuotas.filter(c => c.estado === 'pendiente').length;
    const cuotasAtrasadas  = prestamo.cuotas.filter(c => c.estado === 'atrasado').length;
    const totalMora        = prestamo.moras.reduce((s, m) => s + Number(m.monto || 0), 0);
    const saldoActual      = await this.calcularSaldoActual(prestamoId);
    const totalPagado      = Number(prestamo.monto) - saldoActual;

    return {
      prestamo_id:       prestamo.id,
      monto_original:    Number(prestamo.monto),
      saldo_actual:      saldoActual,
      total_pagado:      parseFloat(totalPagado.toFixed(2)),
      cuota_calculada:   cuotaCalculada,
      frecuencia_pago:   frecuencia,
      cuotas_pagadas:    cuotasPagadas,
      cuotas_pendientes: cuotasPendientes,
      cuotas_atrasadas:  cuotasAtrasadas,
      total_mora:        totalMora,
      porcentaje_avance: Number(prestamo.monto) > 0
        ? Math.round((totalPagado / Number(prestamo.monto)) * 100)
        : 0
    };
  }
}

module.exports = new PrestamoCalculoService();