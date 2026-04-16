// src/services/mora.service.js
const prisma = require("../config/prisma");

exports.aplicarMoraAutomatica = async () => {

  const config = await prisma.configuracion_mora.findFirst();
  const porcentaje = config?.porcentaje || 5;
  const diasGracia = config?.dias_gracia || 0;

  const hoy = new Date();

  // 1. Buscar cuotas vencidas
  const cuotas = await prisma.cuotas.findMany({
    where: {
      estado: { in: ["pendiente", "atrasado"] },
      fecha_vencimiento: {
        lt: new Date(hoy.getTime() - diasGracia * 24 * 60 * 60 * 1000)
      }
    }
  });

  for (const cuota of cuotas) {

    // 2. Verificar si ya tiene mora activa
    const moraExistente = await prisma.moras.findFirst({
      where: {
        cuota_id: cuota.id,
        estado: "activa"
      }
    });

    // 3. Calcular días de atraso
    const diasAtraso = Math.floor(
      (hoy - new Date(cuota.fecha_vencimiento)) / (1000 * 60 * 60 * 24)
    );

    // 4. Calcular monto mora
    const montoMora = parseFloat(
      (cuota.monto * (porcentaje / 100)).toFixed(2)
    );

    // =========================
    // 🔥 CASO 1: NO EXISTE MORA
    // =========================
    if (!moraExistente) {

      await prisma.moras.create({
        data: {
          cuota_id: cuota.id,
          prestamo_id: cuota.prestamo_id,
          monto: montoMora,
          dias_atraso: diasAtraso,
          estado: "activa",
          tipo: "automatica"
        }
      });

    } else {
      // =========================
      // 🔥 CASO 2: ACTUALIZAR MORA
      // =========================
      await prisma.moras.update({
        where: { id: moraExistente.id },
        data: {
          dias_atraso: diasAtraso,
          monto: montoMora // opcional: recalcular
        }
      });
    }

    // 5. Marcar cuota como atrasada
    await prisma.cuotas.update({
      where: { id: cuota.id },
      data: { estado: "atrasado" }
    });

    // 6. Actualizar préstamo
    const totalMora = await prisma.moras.aggregate({
      _sum: { monto: true },
      where: {
        prestamo_id: cuota.prestamo_id,
        estado: "activa"
      }
    });

    await prisma.prestamos.update({
      where: { id: cuota.prestamo_id },
      data: {
        tiene_mora: true,
        total_mora: totalMora._sum.monto || 0,
        estado: "atrasado"
      }
    });

    // 7. Auditoría
    await prisma.logs_auditoria.create({
      data: {
        usuario_id: null,
        accion: "MORA_AUTOMATICA",
        tabla_afectada: "moras",
        registro_id: cuota.id
      }
    });
  }

  return { procesadas: cuotas.length };
};