// src/services/amortizacion.service.js
// Corregido: sin interes_mensual, sin sistema_calculo, sin created_by
// Solo usa campos que existen en el schema Prisma real
const prisma = require('../config/prisma');

class AmortizacionService {
  // Calcular interés del período según frecuencia
  calcularInteresPeriodo(capital, interesAnual, frecuencia = 'mensual') {
    const tasaMensual = interesAnual / 100 / 12;
    if (frecuencia === 'quincenal') return (capital * tasaMensual) / 2;
    return capital * tasaMensual;
  }

  // Obtener tabla de amortización de un préstamo
  async obtenerTabla(prestamoId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: { amortizacion: { orderBy: { numero_cuota: 'asc' } } }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');
    return prestamo.amortizacion;
  }

  // Registrar pago aplicando a interés primero, luego capital
  async registrarPago(prestamoId, montoPagado, fechaPago, metodoPago, userId) {
    const prestamo = await prisma.prestamos.findUnique({
      where: { id: parseInt(prestamoId) },
      include: {
        pagos: { orderBy: { fecha_pago: 'desc' }, take: 1 },
        cuotas: { where: { estado: { in: ['pendiente', 'atrasado'] } }, orderBy: { numero: 'asc' } }
      }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const montoN = parseFloat(montoPagado);
    const capitalActual = Number(prestamo.monto);
    const tasaMensual = Number(prestamo.interes) / 100 / 12;
    const interesPeriodo = capitalActual * tasaMensual;

    let abonoCapital = 0;
    let interesPagado = interesPeriodo;
    let saldoRestante = capitalActual;

    if (montoN >= interesPeriodo) {
      abonoCapital  = montoN - interesPeriodo;
      saldoRestante = Math.max(0, capitalActual - abonoCapital);
      interesPagado = interesPeriodo;
    } else {
      interesPagado = montoN;
      saldoRestante = capitalActual;
    }

    // Buscar la cuota pendiente más antigua para asociar el pago
    const cuota = prestamo.cuotas[0];
    if (!cuota) throw new Error('No hay cuotas pendientes');

    const pago = await prisma.pagos.create({
      data: {
        prestamo: { connect: { id: parseInt(prestamoId) } },
        cuota:    { connect: { id: cuota.id } },
        monto:       montoN,
        fecha_pago:  new Date(fechaPago),
        metodo_pago: metodoPago || 'efectivo',
        usuario:     { connect: { id: parseInt(userId) } }
      }
    });

    // Marcar cuota como pagada
    await prisma.cuotas.update({
      where: { id: cuota.id },
      data: { estado: 'pagado', fecha_pago: new Date(fechaPago), monto_pagado: montoN }
    });

    // Cerrar préstamo si no quedan cuotas pendientes
    if (saldoRestante <= 0) {
      await prisma.prestamos.update({ where: { id: parseInt(prestamoId) }, data: { estado: 'pagado' } });
    }

    return {
      success: true,
      data: { pago, capital_anterior: capitalActual, interes_periodo: interesPeriodo, abono_capital: abonoCapital, saldo_restante: saldoRestante }
    };
  }
}

module.exports = new AmortizacionService();
