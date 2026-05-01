// src/controllers/prestamo.controller.js
const prestamoService = require('../services/prestamo.service');
const prisma = require('../config/prisma');

// Funciones auxiliares para respuestas
function calcularCuotaMensual(monto, interesMensual, plazoMeses) {
  if (!monto || !interesMensual || !plazoMeses || monto <= 0 || interesMensual <= 0 || plazoMeses <= 0) {
    return 0;
  }
  const tasaMensual = interesMensual / 100;
  const cuota = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
  return Math.round(cuota * 100) / 100;
}

function tasaPorPeriodo(interesMensual, frecuencia) {
  const tasaMensual = interesMensual / 100;
  switch (frecuencia) {
    case 'diario': return tasaMensual / 30;
    case 'semanal': return tasaMensual / 4;
    case 'quincenal': return tasaMensual / 2;
    default: return tasaMensual;
  }
}

const PrestamoController = {
  // GET / - Listar todos los préstamos
  async listar(req, res) {
    try {
      const prestamos = await prisma.prestamos.findMany({
        include: {
          clientes: {
            select: { id: true, nombre: true, cedula: true, telefono: true, email: true }
          }
        },
        orderBy: { id: 'asc' }
      });

      const prestamosFormateados = prestamos.map(p => ({
        id: p.id,
        cliente: p.clientes ? {
          id: p.clientes.id,
          nombre: p.clientes.nombre,
          cedula: p.clientes.cedula,
          telefono: p.clientes.telefono,
          email: p.clientes.email
        } : null,
        monto: Number(p.monto),
        interes: Number(p.interes),
        plazo: p.plazo,
        plazo_original: p.plazo_original,
        frecuencia_pago: p.frecuencia_pago,
        estado: p.estado,
        fecha_inicio: p.fecha_inicio,
        saldo_actual: Number(p.saldo_actual),
        cuota_mensual: calcularCuotaMensual(Number(p.monto), Number(p.interes), p.plazo)
      }));

      res.json({ success: true, data: prestamosFormateados });
    } catch (error) {
      console.error('Error en GET /prestamos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // GET /:id - Obtener un préstamo por ID
  async obtenerPorId(req, res) {
    try {
      const id = parseInt(req.params.id);
      
      const prestamo = await prisma.prestamos.findUnique({
        where: { id },
        include: {
          clientes: {
            select: {
              id: true,
              nombre: true,
              cedula: true,
              telefono: true,
              email: true,
              direccion: true
            }
          },
          cuotas: {
            orderBy: { numero: 'asc' }
          }
        }
      });

      if (!prestamo) {
        return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
      }

      const tasaPeriodo = tasaPorPeriodo(Number(prestamo.interes), prestamo.frecuencia_pago || 'mensual');
      const periodos = prestamo.plazo_original || prestamo.plazo;
      let cuotaPeriodo = 0;
      
      if (prestamo.monto > 0 && tasaPeriodo > 0 && periodos > 0) {
        const factor = Math.pow(1 + tasaPeriodo, periodos);
        cuotaPeriodo = Number(prestamo.monto) * (tasaPeriodo * factor) / (factor - 1);
        cuotaPeriodo = Math.round(cuotaPeriodo * 100) / 100;
      }

      const cuotasConAmortizacion = await Promise.all(prestamo.cuotas.map(async (cuota) => {
        // Obtener amortización para cada cuota
        const amortizacion = await prisma.amortizacion.findFirst({
          where: {
            prestamo_id: id,
            numero_cuota: cuota.numero
          }
        });
        
        return {
          id: cuota.id,
          numero: cuota.numero,
          monto: Number(cuota.monto),
          fecha_vencimiento: cuota.fecha_vencimiento,
          fecha_pago: cuota.fecha_pago,
          estado: cuota.estado,
          monto_pagado: cuota.monto_pagado ? Number(cuota.monto_pagado) : null,
          capital: amortizacion ? Number(amortizacion.capital) : 0,
          interes: amortizacion ? Number(amortizacion.interes) : 0,
          saldo_restante: amortizacion ? Number(amortizacion.saldo_restante) : 0
        };
      }));

      const prestamoFormateado = {
        id: prestamo.id,
        cliente: prestamo.clientes ? {
          id: prestamo.clientes.id,
          nombre: prestamo.clientes.nombre,
          cedula: prestamo.clientes.cedula,
          telefono: prestamo.clientes.telefono,
          email: prestamo.clientes.email,
          direccion: prestamo.clientes.direccion
        } : null,
        monto: Number(prestamo.monto),
        interes: Number(prestamo.interes),
        plazo: prestamo.plazo,
        plazo_original: prestamo.plazo_original,
        frecuencia_pago: prestamo.frecuencia_pago,
        estado: prestamo.estado,
        fecha_inicio: prestamo.fecha_inicio,
        saldo_actual: Number(prestamo.saldo_actual),
        cuota_por_periodo: cuotaPeriodo,
        cuotas: cuotasConAmortizacion
      };

      res.json({ success: true, data: prestamoFormateado });
    } catch (error) {
      console.error('Error en GET /prestamos/:id:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // POST / - Crear un nuevo préstamo
  async crear(req, res) {
    try {
      const prestamo = await prestamoService.crearPrestamo(req.body);
      res.status(201).json({
        success: true,
        message: `Préstamo creado exitosamente con frecuencia ${req.body.frecuencia_pago || 'mensual'}`,
        data: prestamo
      });
    } catch (error) {
      console.error('Error al crear préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PUT /:id - Actualizar un préstamo
  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { estado, monto, interes, plazo } = req.body;

      const updateData = {};
      if (estado !== undefined) updateData.estado = estado;
      if (monto !== undefined) updateData.monto = parseFloat(monto);
      if (interes !== undefined) updateData.interes = parseFloat(interes);
      if (plazo !== undefined) updateData.plazo = parseInt(plazo);

      const prestamo = await prisma.prestamos.update({
        where: { id: parseInt(id) },
        data: updateData
      });

      res.json({ success: true, data: prestamo });
    } catch (error) {
      console.error('Error al actualizar préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // DELETE /:id - Eliminar un préstamo
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

  // PUT /:id/estado - Actualizar estado del préstamo
  async actualizarEstado(req, res) {
    try {
      const id = parseInt(req.params.id);
      const { estado } = req.body;

      const estadosValidos = ['pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado', 'cancelado'];
      
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ 
          success: false, 
          message: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}` 
        });
      }

      const prestamoExistente = await prisma.prestamos.findUnique({ where: { id } });
      if (!prestamoExistente) {
        return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
      }

      const prestamo = await prisma.prestamos.update({
        where: { id },
        data: { estado }
      });

      res.json({ 
        success: true, 
        message: 'Estado actualizado exitosamente',
        data: { id: prestamo.id, estado: prestamo.estado }
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PATCH /:id/cuotas/:cuotaId/pagar - Registrar pago de una cuota
  async registrarPago(req, res) {
    try {
      const prestamoId = parseInt(req.params.id);
      const cuotaId = parseInt(req.params.cuotaId);
      const { fecha_pago, monto_pagado, notas } = req.body;

      // Obtener cuota con pagos previos y relación con préstamo
      const cuota = await prisma.cuotas.findFirst({
        where: {
          id: cuotaId,
          prestamo_id: prestamoId
        },
        include: {
          prestamo: true
        }
      });

      if (!cuota) {
        return res.status(404).json({ success: false, message: 'Cuota no encontrada' });
      }

      if (cuota.estado === 'pagado') {
        return res.status(400).json({ success: false, message: 'Esta cuota ya fue pagada' });
      }

      const fechaPago = fecha_pago ? new Date(fecha_pago) : new Date();
      const montoPagadoAhora = monto_pagado ? parseFloat(monto_pagado) : cuota.monto;
      
      // Calcular total pagado acumulado
      const totalPagadoPrevio = cuota.monto_pagado ? parseFloat(cuota.monto_pagado) : 0;
      const totalPagadoAcumulado = totalPagadoPrevio + montoPagadoAhora;
      const cuotaCompleta = totalPagadoAcumulado >= parseFloat(cuota.monto);
      
      // Calcular lo que falta por pagar
      const pendiente = parseFloat(cuota.monto) - totalPagadoAcumulado;

      if (montoPagadoAhora <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El monto pagado debe ser mayor a 0'
        });
      }

      if (montoPagadoAhora > (cuota.monto - totalPagadoPrevio)) {
        return res.status(400).json({
          success: false,
          message: `El monto excede lo pendiente de la cuota. Pendiente: RD$${pendiente.toFixed(2)}`
        });
      }

      console.log('📊 Procesando pago:', {
        cuotaId,
        montoCuota: cuota.monto,
        montoPagadoAhora,
        totalPagadoPrevio,
        totalPagadoAcumulado,
        cuotaCompleta,
        pendiente
      });

      await prisma.$transaction(async (tx) => {
        // 1. Actualizar la cuota
        await tx.cuotas.update({
          where: { id: cuotaId },
          data: {
            estado: cuotaCompleta ? 'pagado' : 'pendiente',
            fecha_pago: cuotaCompleta ? fechaPago : null,
            monto_pagado: totalPagadoAcumulado
          }
        });

        // 2. Actualizar amortización si existe
        const amortizacion = await tx.amortizacion.findFirst({
          where: {
            prestamo_id: prestamoId,
            numero_cuota: cuota.numero
          }
        });

        if (amortizacion) {
          await tx.amortizacion.update({
            where: { id: amortizacion.id },
            data: {
              estado: cuotaCompleta ? 'pagado' : 'pendiente',
              fecha_pago: cuotaCompleta ? fechaPago : null
            }
          });
        }

        // 3. Registrar el pago
        let usuarioId = req.user?.id;
        const usuarioExiste = usuarioId
          ? await tx.usuarios.findUnique({ where: { id: usuarioId }, select: { id: true } })
          : null;

        if (!usuarioExiste) {
          const fallback = await tx.usuarios.findFirst({
            where: { estado: 'activo' },
            select: { id: true }
          });
          if (!fallback) {
            throw new Error('No hay usuarios activos en el sistema');
          }
          usuarioId = fallback.id;
        }

        await tx.pagos.create({
          data: {
            prestamo: { connect: { id: prestamoId } },
            cuota: { connect: { id: cuotaId } },
            monto: montoPagadoAhora,
            fecha_pago: fechaPago,
            metodo_pago: 'efectivo',
            usuario: { connect: { id: usuarioId } },
            notas: notas || null
          }
        });

        // 4. Actualizar saldo del préstamo (solo el capital pagado)
        // Obtener el capital de esta cuota desde amortización
        let capitalPagado = 0;
        if (amortizacion) {
          if (cuotaCompleta) {
            capitalPagado = parseFloat(amortizacion.capital);
          } else {
            // Pago parcial: calcular proporción de capital
            const proporcion = montoPagadoAhora / parseFloat(cuota.monto);
            capitalPagado = parseFloat(amortizacion.capital) * proporcion;
          }
        }

        const saldoActual = parseFloat(cuota.prestamo.saldo_actual || cuota.prestamo.monto);
        const nuevoSaldo = Math.max(0, saldoActual - capitalPagado);

        await tx.prestamos.update({
          where: { id: prestamoId },
          data: { 
            saldo_actual: nuevoSaldo,
            estado: nuevoSaldo <= 0 ? 'pagado' : cuota.prestamo.estado
          }
        });

        // 5. Verificar si todas las cuotas están pagadas
        const cuotasPendientes = await tx.cuotas.count({
          where: {
            prestamo_id: prestamoId,
            estado: { not: 'pagado' }
          }
        });

        if (cuotasPendientes === 0) {
          await tx.prestamos.update({
            where: { id: prestamoId },
            data: { estado: 'pagado' }
          });
        }
      });

      res.json({ 
        success: true, 
        message: cuotaCompleta ? 'Cuota pagada completamente' : 'Pago parcial registrado',
        data: {
          cuota_completada: cuotaCompleta,
          total_pagado: totalPagadoAcumulado,
          pendiente: pendiente
        }
      });
    } catch (error) {
      console.error('Error registrando pago:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = PrestamoController;
