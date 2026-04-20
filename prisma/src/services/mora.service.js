// src/services/mora.service.js
// ✅ Migrado de MySQL a PostgreSQL — sin cambios en la lógica,
// este servicio usa solo Prisma ORM (sin $queryRaw), así que
// la migración es directa. Solo documentamos el cambio de provider.

const prisma = require('../config/prisma');

exports.aplicarMoraAutomatica = async () => {

  const config = await prisma.configuracion_mora.findFirst();
  const porcentaje  = Number(config?.porcentaje ?? 5);
  const diasGracia  = Number(config?.dias_gracia ?? 0);

  const hoy = new Date();

  const cuotas = await prisma.cuotas.findMany({
    where: {
      estado: { in: ['pendiente', 'atrasado'] },
      fecha_vencimiento: {
        lt: new Date(hoy.getTime() - diasGracia * 24 * 60 * 60 * 1000)
      }
    }
  });

  for (const cuota of cuotas) {

    const moraExistente = await prisma.moras.findFirst({
      where: { cuota_id: cuota.id, estado: 'activa' }
    });

    const diasAtraso = Math.floor(
      (hoy - new Date(cuota.fecha_vencimiento)) / (1000 * 60 * 60 * 24)
    );

    const montoMora = parseFloat(
      (Number(cuota.monto) * (porcentaje / 100)).toFixed(2)
    );

    if (!moraExistente) {
      await prisma.moras.create({
        data: {
          cuota_id:    cuota.id,
          prestamo_id: cuota.prestamo_id,
          monto:       montoMora,
          dias_atraso: diasAtraso,
          estado:      'activa'
        }
      });
    } else {
      await prisma.moras.update({
        where: { id: moraExistente.id },
        data:  { dias_atraso: diasAtraso, monto: montoMora }
      });
    }

    await prisma.cuotas.update({
      where: { id: cuota.id },
      data:  { estado: 'atrasado' }
    });

    const totalMora = await prisma.moras.aggregate({
      _sum:  { monto: true },
      where: { prestamo_id: cuota.prestamo_id, estado: 'activa' }
    });

    await prisma.prestamos.update({
      where: { id: cuota.prestamo_id },
      data:  {
        tiene_mora: true,
        total_mora: totalMora._sum.monto ?? 0,
        estado:     'atrasado'
      }
    });

    await prisma.logs_auditoria.create({
      data: {
        usuario_id:     null,
        accion:         'MORA_AUTOMATICA',
        tabla_afectada: 'moras',
        registro_id:    cuota.id
      }
    });
  }

  return { procesadas: cuotas.length };
};