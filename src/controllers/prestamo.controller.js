// src/controllers/prestamo.controller.js
const prestamoService = require('../services/prestamo.service');
const prisma = require('../config/prisma');

// Funciones auxiliares para respuestas (igual que en el router original)
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
  // GET / - Listar todos los préstamos (con el mismo formato que el router original)
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

  // GET /:id - Obtener un préstamo por ID (con el mismo formato que el router original)
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

      const cuotasConAmortizacion = prestamo.cuotas.map((cuota) => ({
        id: cuota.id,
        numero: cuota.numero,
        monto: Number(cuota.monto),
        fecha_vencimiento: cuota.fecha_vencimiento,
        fecha_pago: cuota.fecha_pago,
        estado: cuota.estado,
        monto_pagado: cuota.monto_pagado ? Number(cuota.monto_pagado) : null
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

    // Obtener cuota con pagos previos
    const cuota = await prisma.cuotas.findFirst({
      where: {
        id: cuotaId,
        prestamo_id: prestamoId
      },
      include: {
        prestamo: true,
        pagos: true  // ← Incluir pagos previos
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

    // Calcular total pagado (incluyendo pagos anteriores)
    const totalPagadoPrevio = cuota.monto_pagado ? parseFloat(cuota.monto_pagado) : 0;
    const totalPagadoNuevo = totalPagadoPrevio + montoPagadoAhora;
    const cuotaCompleta = totalPagadoNuevo >= parseFloat(cuota.monto);

    if (montoPagadoAhora > (cuota.monto - totalPagadoPrevio)) {
      return res.status(400).json({
        success: false,
        message: `El monto excede lo pendiente de la cuota. Pendiente: RD$${(cuota.monto - totalPagadoPrevio).toFixed(2)}`
      });
    }

    await prisma.$transaction(async (tx) => {
      // Actualizar cuota con el monto acumulado
      await tx.cuotas.update({
        where: { id: cuotaId },
        data: {
          estado: cuotaCompleta ? 'pagado' : 'pendiente',
          fecha_pago: cuotaCompleta ? fechaPago : null,
          monto_pagado: totalPagadoNuevo
        }
      });

      // Resto del código (amortización, pagos, etc.)...
      // ... mantener igual ...
    });

    res.json({ 
      success: true, 
      message: cuotaCompleta ? 'Cuota pagada completamente' : 'Pago parcial registrado',
      data: {
        cuota_completada: cuotaCompleta,
        total_pagado: totalPagadoNuevo,
        pendiente: cuota.monto - totalPagadoNuevo
      }
    });
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
};

module.exports = PrestamoController;