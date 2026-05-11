// src/controllers/prestamo.controller.js

const prestamoService = require('../services/prestamo.service');
const prisma = require('../config/prisma');

// -------------------------------------------------------
// Helpers de cálculo
// -------------------------------------------------------
function tasaPorPeriodo(interesMensual, frecuencia) {
  const tasaMensual = interesMensual / 100;
  switch (frecuencia) {
    case 'diaria':    return tasaMensual / 26;
    case 'semanal':   return tasaMensual / 4;
    case 'quincenal': return tasaMensual / 2;
    default:          return tasaMensual;
  }
}

function calcularCuotaPeriodo(monto, tasaPeriodo, periodos) {
  if (!monto || !tasaPeriodo || !periodos || monto <= 0 || periodos <= 0) return 0;
  if (tasaPeriodo === 0) return monto / periodos;
  const factor = Math.pow(1 + tasaPeriodo, periodos);
  return Math.round(monto * (tasaPeriodo * factor) / (factor - 1) * 100) / 100;
}

// -------------------------------------------------------
// Controller
// -------------------------------------------------------
const PrestamoController = {

  // GET / — Listar todos los préstamos
  async listar(req, res) {
    try {
      const prestamos = await prisma.prestamos.findMany({
        where: { deleted_at: null },
        include: {
          clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true } }
        },
        orderBy: { id: 'desc' }
      });

      const data = prestamos.map(p => {
        const frecuencia = p.frecuencia_pago || 'mensual';
        const tasa = tasaPorPeriodo(Number(p.interes), frecuencia);
        const periodos = p.plazo_original || p.plazo;
        return {
          id:              p.id,
          cliente:         p.clientes || null,
          monto:           Number(p.monto),
          interes:         Number(p.interes),
          plazo:           p.plazo,
          plazo_original:  p.plazo_original,
          frecuencia_pago: frecuencia,
          estado:          p.estado,
          fecha_inicio:    p.fecha_inicio,
          saldo_actual:    Number(p.saldo_actual || p.monto),
          cuota_periodo:   calcularCuotaPeriodo(Number(p.monto), tasa, periodos)
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error en GET /prestamos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // GET /:id — Obtener préstamo por ID
  async obtenerPorId(req, res) {
    try {
      const id = parseInt(req.params.id);

      const prestamo = await prisma.prestamos.findUnique({
        where: { id },
        include: {
          clientes:     { select: { id: true, nombre: true, cedula: true, telefono: true, email: true, direccion: true } },
          cuotas:       { orderBy: { numero: 'asc' } },
          amortizacion: { orderBy: { numero_cuota: 'asc' } }
        }
      });

      if (!prestamo) return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });

      const frecuencia   = prestamo.frecuencia_pago || 'mensual';
      const tasa         = tasaPorPeriodo(Number(prestamo.interes), frecuencia);
      const periodos     = prestamo.plazo_original || prestamo.plazo;
      const cuotaPeriodo = calcularCuotaPeriodo(Number(prestamo.monto), tasa, periodos);

      const cuotasFormateadas = prestamo.cuotas.map(c => {
        const amort = prestamo.amortizacion.find(a => a.numero_cuota === c.numero);
        return {
          id:                c.id,
          numero:            c.numero,
          monto:             Number(c.monto),
          monto_pagado:      Number(c.monto_pagado || 0),
          fecha_vencimiento: c.fecha_vencimiento,
          fecha_pago:        c.fecha_pago,
          estado:            c.estado,
          capital:           amort ? Number(amort.capital)        : null,
          interes:           amort ? Number(amort.interes)        : null,
          saldo_restante:    amort ? Number(amort.saldo_restante) : null
        };
      });

      res.json({
        success: true,
        data: {
          id:              prestamo.id,
          cliente:         prestamo.clientes || null,
          monto:           Number(prestamo.monto),
          interes:         Number(prestamo.interes),
          plazo:           prestamo.plazo,
          plazo_original:  prestamo.plazo_original,
          frecuencia_pago: frecuencia,
          estado:          prestamo.estado,
          fecha_inicio:    prestamo.fecha_inicio,
          saldo_actual:    Number(prestamo.saldo_actual || prestamo.monto),
          cuota_periodo:   cuotaPeriodo,
          cuotas:          cuotasFormateadas
        }
      });
    } catch (error) {
      console.error('Error en GET /prestamos/:id:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // POST / — Crear nuevo préstamo
  // REGLA: siempre se permite crear. Si ya tiene préstamo activo/atrasado
  // se devuelve el préstamo creado más un campo `advertencia` para que el
  // frontend lo muestre al operador.
  async crear(req, res) {
    try {
      const { cliente_id } = req.body;

      if (!cliente_id) {
        return res.status(400).json({ success: false, message: 'cliente_id es requerido' });
      }

      const cliente = await prisma.clientes.findUnique({ where: { id: parseInt(cliente_id) } });
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

      // Verificar si tiene préstamo activo (solo para advertencia, no bloquea)
      const prestamoActivo = await prisma.prestamos.findFirst({
        where: {
          cliente_id: parseInt(cliente_id),
          estado:     { in: ['activo', 'atrasado', 'aprobado'] },
          deleted_at: null
        }
      });

      const prestamo = await prestamoService.crearPrestamo(req.body);

      res.status(201).json({
        success: true,
        message: prestamoActivo
          ? `Préstamo creado. ⚠️ Este cliente ya tiene el préstamo #${prestamoActivo.id} en estado "${prestamoActivo.estado}".`
          : `Préstamo #${prestamo.id} creado exitosamente.`,
        data: prestamo,
        advertencia: prestamoActivo
          ? { prestamo_activo_id: prestamoActivo.id, estado: prestamoActivo.estado }
          : null
      });
    } catch (error) {
      console.error('Error al crear préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PUT /:id — Actualizar préstamo
  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { estado, monto, interes, plazo } = req.body;

      const updateData = {};
      if (estado  !== undefined) updateData.estado  = estado;
      if (monto   !== undefined) updateData.monto   = parseFloat(monto);
      if (interes !== undefined) updateData.interes = parseFloat(interes);
      if (plazo   !== undefined) updateData.plazo   = parseInt(plazo);

      const prestamo = await prisma.prestamos.update({ where: { id: parseInt(id) }, data: updateData });
      res.json({ success: true, data: prestamo });
    } catch (error) {
      console.error('Error al actualizar préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // DELETE /:id — Eliminar préstamo
  async eliminar(req, res) {
    try {
      const { id } = req.params;
      await prisma.prestamos.delete({ where: { id: parseInt(id) } });
      res.json({ success: true, message: 'Préstamo eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PUT /:id/estado — Cambiar estado del préstamo
  async actualizarEstado(req, res) {
    try {
      const id    = parseInt(req.params.id);
      const { estado } = req.body;

      const estadosValidos = ['pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado', 'cancelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ success: false, message: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
      }

      const prestamoExistente = await prisma.prestamos.findUnique({ where: { id } });
      if (!prestamoExistente) return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });

      const prestamo = await prisma.prestamos.update({ where: { id }, data: { estado } });
      res.json({ success: true, message: 'Estado actualizado', data: { id: prestamo.id, estado: prestamo.estado } });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PATCH /:id/cuotas/:cuotaId/pagar — Registrar pago
  async registrarPago(req, res) {
    try {
      const prestamoId = parseInt(req.params.id);
      const cuotaId    = parseInt(req.params.cuotaId);
      const { fecha_pago, monto_pagado, notas, metodo_pago } = req.body;

      const [cuota, prestamo] = await Promise.all([
        prisma.cuotas.findFirst({ where: { id: cuotaId, prestamo_id: prestamoId } }),
        prisma.prestamos.findUnique({ where: { id: prestamoId } })
      ]);

      if (!cuota)    return res.status(404).json({ success: false, message: 'Cuota no encontrada' });
      if (!prestamo) return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
      if (cuota.estado === 'pagado') return res.status(400).json({ success: false, message: 'Esta cuota ya fue pagada' });

      const fechaPago         = fecha_pago ? new Date(fecha_pago) : new Date();
      const montoPagadoPrevio = Number(cuota.monto_pagado || 0);
      const montoCuota        = Number(cuota.monto);
      const pendienteCuota    = montoCuota - montoPagadoPrevio;
      const montoAhora        = monto_pagado ? parseFloat(monto_pagado) : pendienteCuota;

      if (montoAhora <= 0) return res.status(400).json({ success: false, message: 'El monto debe ser mayor a 0' });
      if (montoAhora > pendienteCuota) {
        return res.status(400).json({
          success: false,
          message: `El monto excede lo pendiente. Pendiente: RD$${pendienteCuota.toFixed(2)}`
        });
      }

      const totalPagadoCuota = montoPagadoPrevio + montoAhora;
      const cuotaCompleta    = totalPagadoCuota >= montoCuota;

      // Obtener usuario (fallback al primero activo)
      let usuarioId = req.user?.id;
      if (!usuarioId) {
        const u = await prisma.usuarios.findFirst({ where: { estado: 'activo' }, select: { id: true } });
        if (!u) return res.status(400).json({ success: false, message: 'No hay usuario activo para registrar el pago' });
        usuarioId = u.id;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Actualizar cuota
        await tx.cuotas.update({
          where: { id: cuotaId },
          data: {
            monto_pagado: totalPagadoCuota,
            estado:       cuotaCompleta ? 'pagado' : 'pendiente',
            fecha_pago:   cuotaCompleta ? fechaPago : null
          }
        });

        // 2. Actualizar amortización si la cuota quedó completa
        const amort = await tx.amortizacion.findFirst({
          where: { prestamo_id: prestamoId, numero_cuota: cuota.numero }
        });
        if (amort && cuotaCompleta) {
          await tx.amortizacion.update({
            where: { id: amort.id },
            data: { estado: 'pagado', fecha_pago: fechaPago }
          });
        }

        // 3. Registrar en tabla pagos
        await tx.pagos.create({
          data: {
            prestamo:    { connect: { id: prestamoId } },
            cuota:       { connect: { id: cuotaId } },
            monto:       montoAhora,
            fecha_pago:  fechaPago,
            metodo_pago: metodo_pago || 'efectivo',
            usuario:     { connect: { id: usuarioId } },
            notas:       notas || null
          }
        });

        // 4. Recalcular saldo_actual del préstamo sumando todos los pagos
        const agregado = await tx.pagos.aggregate({
          where:  { prestamo_id: prestamoId, deleted_at: null },
          _sum:   { monto: true }
        });
        const totalPagadoAlPrestamo = Number(agregado._sum.monto || 0);
        const nuevoSaldo = Math.max(Number(prestamo.monto) - totalPagadoAlPrestamo, 0);

        // 5. Marcar préstamo como pagado si no quedan cuotas pendientes
        const cuotasPendientes = await tx.cuotas.count({
          where: { prestamo_id: prestamoId, estado: { not: 'pagado' } }
        });

        await tx.prestamos.update({
          where: { id: prestamoId },
          data: {
            saldo_actual: nuevoSaldo,
            estado: cuotasPendientes === 0 ? 'pagado' : prestamo.estado
          }
        });
      });

      res.json({
        success: true,
        message: cuotaCompleta ? 'Cuota pagada completamente' : 'Pago parcial registrado',
        data: {
          cuota_completada: cuotaCompleta,
          total_pagado:     totalPagadoCuota,
          pendiente_cuota:  Math.max(montoCuota - totalPagadoCuota, 0)
        }
      });
    } catch (error) {
      console.error('Error registrando pago:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = PrestamoController;
