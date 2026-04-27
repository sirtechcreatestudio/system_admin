// src/services/amortizacion.service.js
// CORRECCIÓN: registrarPago ya NO marca la cuota como "pagado" por recibir
// cualquier monto. Solo la marca pagada si el monto cubre la cuota completa.
// El saldo_actual del préstamo se reduce solo por el capital abonado.

const prisma = require('../config/prisma');

class AmortizacionService {

  _tasaPorFrecuencia(interesAnual, frecuencia = 'mensual') {
    const anual = interesAnual / 100;
    switch (frecuencia) {
      case 'diaria':    return anual / 365;
      case 'semanal':   return anual / 52;
      case 'quincenal': return anual / 24;
      default:          return anual / 12;
    }
  }

  async obtenerTabla(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: { amortizacion: { orderBy: { numero_cuota: 'asc' } } }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');
    return prestamo.amortizacion;
  }

  /**
   * Registra un pago directo sobre un préstamo.
   * - La cuota solo se marca "pagado" si se cubrió su monto total.
   * - El saldo del préstamo baja únicamente por el capital efectivamente abonado.
   * - Si saldo llega a 0, el préstamo se marca como 'pagado'.
   */
  async registrarPago(prestamoId, montoPagado, fechaPago, metodoPago, userId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        cuotas: {
          where: { estado: { in: ['pendiente', 'atrasado'] } },
          orderBy: { numero: 'asc' }
        }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');
    if (prestamo.estado === 'pagado') throw new Error('Este préstamo ya está completamente pagado');

    const montoN = parseFloat(montoPagado);
    const saldoActual = Number(prestamo.saldo_actual ?? prestamo.monto);
    const frecuencia  = prestamo.frecuencia_pago || 'mensual';
    const tasa        = this._tasaPorFrecuencia(Number(prestamo.interes), frecuencia);

    // Calcular interés del período sobre el saldo actual real
    const interesPeriodo  = parseFloat((saldoActual * tasa).toFixed(2));
    const abonoCapital    = Math.max(0, parseFloat((montoN - interesPeriodo).toFixed(2)));
    const interesPagado   = Math.min(montoN, interesPeriodo);
    const nuevoSaldo      = Math.max(0, parseFloat((saldoActual - abonoCapital).toFixed(2)));

    const cuota = prestamo.cuotas[0];
    if (!cuota) throw new Error('No hay cuotas pendientes');

    // Acumular monto_pagado de la cuota
    const montoPagadoAcumulado = parseFloat(
      ((Number(cuota.monto_pagado) || 0) + montoN).toFixed(2)
    );
    const cuotaCompleta = montoPagadoAcumulado >= Number(cuota.monto);

    return await prisma.$transaction(async (tx) => {
      // Registrar pago
      const pago = await tx.pagos.create({
        data: {
          prestamo: { connect: { id: parseInt(prestamoId) } },
          cuota:    { connect: { id: cuota.id } },
          monto:       montoN,
          fecha_pago:  new Date(fechaPago),
          metodo_pago: metodoPago || 'efectivo',
          usuario:     { connect: { id: parseInt(userId) } }
        }
      });

      // Actualizar cuota — pagada solo si monto cubierto completamente
      await tx.cuotas.update({
        where: { id: cuota.id },
        data: {
          monto_pagado: montoPagadoAcumulado,
          estado:      cuotaCompleta ? 'pagado' : cuota.estado,
          fecha_pago:  cuotaCompleta ? new Date(fechaPago) : undefined
        }
      });

      // Actualizar amortización si cuota completa
      if (cuotaCompleta) {
        await tx.amortizacion.updateMany({
          where: { prestamo_id: parseInt(prestamoId), numero_cuota: cuota.numero },
          data: { estado: 'pagado', fecha_pago: new Date(fechaPago) }
        });
      }

      // Actualizar saldo real del préstamo
      await tx.prestamos.update({
        where: { id: parseInt(prestamoId) },
        data: {
          saldo_actual: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? 'pagado' : prestamo.estado
        }
      });

      return {
        success: true,
        data: {
          pago,
          saldo_anterior:  saldoActual,
          interes_periodo: interesPeriodo,
          interes_pagado:  interesPagado,
          abono_capital:   abonoCapital,
          saldo_restante:  nuevoSaldo,
          cuota_completada: cuotaCompleta,
          prestamo_saldado: nuevoSaldo <= 0
        }
      };
    });
  }
}

module.exports = new AmortizacionService();