// src/services/pago.service.js
// CORRECCIÓN: El préstamo se cierra cuando saldo_actual llega a 0 (por monto),
// NO por número de cuotas completadas. Las cuotas se marcan pagadas solo si
// se cubrió su monto completo; si es pago parcial quedan "pendiente" con monto_pagado parcial.

const prisma = require('../config/prisma');

exports.aplicarPagoMultiCuota = async (data, userId) => {
  const { prestamo_id, monto, metodo_pago, notas } = data;

  return await prisma.$transaction(async (tx) => {

    // =========================
    // 🔐 VALIDAR CAJA
    // =========================
    const cajaAbierta = await tx.caja.findFirst({
      where: { usuario_id: userId, estado: 'abierta' }
    });
    if (!cajaAbierta) throw new Error('No tienes caja abierta');

    // =========================
    // 🔍 OBTENER PRÉSTAMO
    // =========================
    const prestamo = await tx.prestamos.findUnique({
      where: { id: parseInt(prestamo_id) }
    });
    if (!prestamo) throw new Error('Préstamo no encontrado');
    if (prestamo.estado === 'pagado') throw new Error('Este préstamo ya está completamente pagado');

    const saldoActual = Number(prestamo.saldo_actual ?? prestamo.monto);
    if (saldoActual <= 0) throw new Error('Este préstamo ya está saldado');

    const montoRecibido = parseFloat(monto);
    if (montoRecibido <= 0) throw new Error('El monto debe ser mayor a 0');
    if (montoRecibido > saldoActual) throw new Error(`El monto excede el saldo pendiente (RD$${saldoActual.toFixed(2)})`);

    // =========================
    // 🔍 OBTENER CUOTAS PENDIENTES (orden ascendente)
    // =========================
    const cuotas = await tx.cuotas.findMany({
      where: {
        prestamo_id: parseInt(prestamo_id),
        estado: { in: ['pendiente', 'atrasado'] }
      },
      orderBy: { numero: 'asc' }
    });
    if (!cuotas.length) throw new Error('No hay cuotas pendientes');

    let montoRestante = montoRecibido;
    const pagosDetalle = [];

    // =========================
    // 🔁 RECORRER CUOTAS
    // =========================
    for (const cuota of cuotas) {
      if (montoRestante <= 0) break;

      let moraPagada = 0;
      let interesPagado = 0;
      let capitalPagado = 0;

      // --- Pagar moras primero ---
      const moras = await tx.moras.findMany({
        where: { cuota_id: cuota.id, estado: 'activa' }
      });

      for (const mora of moras) {
        if (montoRestante <= 0) break;
        const montoMora = Number(mora.monto);

        if (montoRestante >= montoMora) {
          moraPagada += montoMora;
          montoRestante -= montoMora;
          await tx.moras.update({ where: { id: mora.id }, data: { estado: 'pagada' } });
        } else {
          moraPagada += montoRestante;
          await tx.moras.update({
            where: { id: mora.id },
            data: { monto: montoMora - montoRestante }
          });
          montoRestante = 0;
        }
      }

      // --- Aplicar a amortización (interés → capital) ---
      const amort = await tx.amortizacion.findFirst({
        where: { prestamo_id: parseInt(prestamo_id), numero_cuota: cuota.numero }
      });
      if (!amort) throw new Error(`Amortización no encontrada para cuota ${cuota.numero}`);

      const interesPendienteAmort = Number(amort.interes);
      const capitalPendienteAmort = Number(amort.capital);

      // Interés
      if (montoRestante > 0) {
        const aInterés = Math.min(montoRestante, interesPendienteAmort);
        interesPagado = aInterés;
        montoRestante -= aInterés;
      }

      // Capital
      if (montoRestante > 0) {
        const aCapital = Math.min(montoRestante, capitalPendienteAmort);
        capitalPagado = aCapital;
        montoRestante -= aCapital;
      }

      const totalPagadoCuota = moraPagada + interesPagado + capitalPagado;

      if (totalPagadoCuota <= 0) continue;

      // --- Registrar pago ---
      await tx.pagos.create({
        data: {
          prestamo_id: parseInt(prestamo_id),
          cuota_id: cuota.id,
          monto: totalPagadoCuota,
          fecha_pago: new Date(),
          metodo_pago: metodo_pago || 'efectivo',
          usuario_id: userId,
          notas: notas || null
        }
      });

      // --- Determinar si la cuota quedó completamente pagada ---
      // Una cuota está pagada cuando su monto total (capital + interés) fue cubierto
      const montoPagadoAcumulado = (Number(cuota.monto_pagado) || 0) + totalPagadoCuota;
      const cuotaCompleta = montoPagadoAcumulado >= Number(cuota.monto);

      await tx.cuotas.update({
        where: { id: cuota.id },
        data: {
          monto_pagado: montoPagadoAcumulado,
          estado: cuotaCompleta ? 'pagado' : cuota.estado,
          fecha_pago: cuotaCompleta ? new Date() : undefined
        }
      });

      // --- Actualizar amortización ---
      if (cuotaCompleta) {
        await tx.amortizacion.update({
          where: { id: amort.id },
          data: { estado: 'pagado', fecha_pago: new Date() }
        });
      }

      pagosDetalle.push({
        cuota: cuota.numero,
        moraPagada,
        interesPagado,
        capitalPagado,
        totalPagado: totalPagadoCuota,
        cuotaCompletada: cuotaCompleta
      });
    }

    // =========================
    // 🔥 ACTUALIZAR SALDO REAL DEL PRÉSTAMO
    // =========================
    // El saldo se reduce por el capital efectivamente abonado (no el total pagado)
    const capitalAbonado = pagosDetalle.reduce((sum, d) => sum + d.capitalPagado, 0);
    const nuevoSaldo = Math.max(saldoActual - capitalAbonado, 0);

    // Actualizar moras pendientes
    const moraPendiente = await tx.moras.aggregate({
      _sum: { monto: true },
      where: { prestamo_id: parseInt(prestamo_id), estado: 'activa' }
    });

    // Determinar estado del préstamo
    let nuevoEstado = prestamo.estado;
    if (nuevoSaldo <= 0) {
      nuevoEstado = 'pagado';
    }

    await tx.prestamos.update({
      where: { id: parseInt(prestamo_id) },
      data: {
        saldo_actual: nuevoSaldo,
        total_mora: moraPendiente._sum.monto || 0,
        tiene_mora: (moraPendiente._sum.monto || 0) > 0,
        estado: nuevoEstado
      }
    });

    // =========================
    // 🔥 REGISTRAR EN CAJA
    // =========================
    await tx.movimientos_caja.create({
      data: {
        caja_id: cajaAbierta.id,
        tipo: 'ingreso',
        monto: montoRecibido,
        descripcion: `Pago préstamo #${prestamo_id} — Saldo anterior: RD$${saldoActual.toFixed(2)}, Nuevo saldo: RD$${nuevoSaldo.toFixed(2)}`
      }
    });

    // =========================
    // 🔥 AUDITORÍA
    // =========================
    await tx.logs_auditoria.create({
      data: {
        usuario_id: userId,
        accion: 'PAGO_PRESTAMO',
        tabla_afectada: 'pagos',
        registro_id: parseInt(prestamo_id)
      }
    });

    return {
      success: true,
      monto_recibido: montoRecibido,
      saldo_anterior: saldoActual,
      saldo_nuevo: nuevoSaldo,
      prestamo_saldado: nuevoSaldo <= 0,
      detalle: pagosDetalle
    };
  });
};