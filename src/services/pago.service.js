// src/services/pago.service.js

exports.aplicarPagoMultiCuota = async (data, userId) => {
  const { prestamo_id, monto, metodo_pago_id } = data;

  return await prisma.$transaction(async (tx) => {

    let montoRestante = monto;

    // =========================
    // 🔐 VALIDAR CAJA
    // =========================
    const cajaAbierta = await tx.caja.findFirst({
      where: {
        usuario_id: userId,
        estado: "abierta"
      }
    });

    if (!cajaAbierta) {
      throw new Error("No tienes caja abierta");
    }

    // =========================
    // 🔍 OBTENER CUOTAS ORDENADAS
    // =========================
    const cuotas = await tx.cuotas.findMany({
      where: {
        prestamo_id,
        estado: { in: ["pendiente", "atrasado"] }
      },
      orderBy: {
        numero: 'asc' // 🔥 primero las más antiguas
      }
    });

    if (!cuotas.length) {
      throw new Error("No hay cuotas pendientes");
    }

    const pagosDetalle = [];

    // =========================
    // 🔁 RECORRER CUOTAS
    // =========================
    for (const cuota of cuotas) {

      if (montoRestante <= 0) break;

      let moraPagada = 0;
      let interesPagado = 0;
      let capitalPagado = 0;

      // =========================
      // 🔥 PAGAR MORAS
      // =========================
      const moras = await tx.moras.findMany({
        where: {
          cuota_id: cuota.id,
          estado: "activa"
        }
      });

      for (const mora of moras) {
        if (montoRestante <= 0) break;

        if (montoRestante >= mora.monto) {
          moraPagada += mora.monto;
          montoRestante -= mora.monto;

          await tx.moras.update({
            where: { id: mora.id },
            data: { estado: "pagada" }
          });

        } else {
          moraPagada += montoRestante;

          await tx.moras.update({
            where: { id: mora.id },
            data: { monto: mora.monto - montoRestante }
          });

          montoRestante = 0;
        }
      }

      // =========================
      // 🔥 AMORTIZACIÓN
      // =========================
      const amort = await tx.amortizacion.findFirst({
        where: {
          prestamo_id,
          numero_cuota: cuota.numero
        }
      });

      if (!amort) throw new Error("Amortización no encontrada");

      // interés
      if (montoRestante > 0) {
        if (montoRestante >= amort.interes) {
          interesPagado = amort.interes;
          montoRestante -= amort.interes;
        } else {
          interesPagado = montoRestante;
          montoRestante = 0;
        }
      }

      // capital
      if (montoRestante > 0) {
        if (montoRestante >= amort.capital) {
          capitalPagado = amort.capital;
          montoRestante -= amort.capital;
        } else {
          capitalPagado = montoRestante;
          montoRestante = 0;
        }
      }

      const totalPagado = moraPagada + interesPagado + capitalPagado;

      // =========================
      // 🔥 ACTUALIZAR CUOTA
      // =========================
      if (totalPagado >= cuota.monto) {
        await tx.cuotas.update({
          where: { id: cuota.id },
          data: { estado: "pagado" }
        });
      }

      // =========================
      // 🔥 REGISTRAR PAGO
      // =========================
      if (totalPagado > 0) {
        await tx.pagos.create({
          data: {
            prestamo_id,
            cuota_id: cuota.id,
            monto: totalPagado,
            metodo_pago_id,
            usuario_id: userId
          }
        });
      }

      pagosDetalle.push({
        cuota: cuota.numero,
        moraPagada,
        interesPagado,
        capitalPagado,
        totalPagado
      });
    }

    // =========================
    // 🔥 REGISTRAR EN CAJA
    // =========================
    await tx.movimientos_caja.create({
      data: {
        caja_id: cajaAbierta.id,
        tipo: "ingreso",
        monto,
        descripcion: `Pago multi-cuota préstamo ${prestamo_id}`
      }
    });

    // =========================
    // 🔥 ACTUALIZAR PRÉSTAMO
    // =========================
    const moraPendiente = await tx.moras.aggregate({
      _sum: { monto: true },
      where: {
        prestamo_id,
        estado: "activa"
      }
    });

    await tx.prestamos.update({
      where: { id: prestamo_id },
      data: {
        total_mora: moraPendiente._sum.monto || 0,
        tiene_mora: (moraPendiente._sum.monto || 0) > 0
      }
    });

    // =========================
    // 🔥 AUDITORÍA
    // =========================
    await tx.logs_auditoria.create({
      data: {
        usuario_id: userId,
        accion: "PAGO_MULTI_CUOTA",
        tabla_afectada: "pagos",
        registro_id: prestamo_id
      }
    });

    return {
      monto_aplicado: monto,
      detalle: pagosDetalle
    };
  });
};