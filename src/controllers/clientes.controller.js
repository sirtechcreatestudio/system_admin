// src/controllers/clientes.controller.js

const prisma = require('../config/prisma');

// -------------------------------------------------------
// Helper: semáforo de condición del cliente
// 🔴 rojo    — préstamo castigado, o 2+ cuotas vencidas
// 🟡 amarillo — 1 cuota vencida o préstamo en estado 'atrasado'
// 🟢 verde   — al día o sin préstamos activos
// -------------------------------------------------------
async function calcularCondicionCliente(clienteId) {
  const prestamos = await prisma.prestamos.findMany({
    where: { cliente_id: clienteId, deleted_at: null },
    include: {
      cuotas: {
        where: { estado: { not: 'pagado' } }
      }
    }
  });

  if (!prestamos.length) {
    return { color: 'verde', label: 'Sin préstamos', descripcion: 'Cliente sin historial de préstamos.' };
  }

  if (prestamos.some(p => p.estado === 'castigado')) {
    return { color: 'rojo', label: 'No apto', descripcion: 'Cliente tiene préstamo castigado. No apto para nuevo préstamo.' };
  }

  const hoy = new Date();
  let totalVencidas = 0;
  let tieneAtrasado = false;

  for (const p of prestamos) {
    if (['activo', 'atrasado', 'aprobado'].includes(p.estado)) {
      totalVencidas += p.cuotas.filter(c => new Date(c.fecha_vencimiento) < hoy).length;
      if (p.estado === 'atrasado') tieneAtrasado = true;
    }
  }

  if (totalVencidas >= 2) {
    return {
      color: 'rojo',
      label: 'No apto',
      descripcion: `Cliente tiene ${totalVencidas} cuotas vencidas. No apto para nuevo préstamo.`
    };
  }

  if (totalVencidas === 1 || tieneAtrasado) {
    return {
      color: 'amarillo',
      label: 'Paga con retraso',
      descripcion: 'Cliente tiene atrasos. Apto con precaución.'
    };
  }

  return { color: 'verde', label: 'Al día', descripcion: 'Cliente al día. Apto para nuevo préstamo.' };
}

// -------------------------------------------------------
// Helper: calcular cuota por período
// -------------------------------------------------------
function tasaPorPeriodo(interesMensual, frecuencia) {
  const tasa = interesMensual / 100;
  switch (frecuencia) {
    case 'diaria':    return tasa / 26;
    case 'semanal':   return tasa / 4;
    case 'quincenal': return tasa / 2;
    default:          return tasa;
  }
}

function calcCuota(monto, interesMensual, plazo, frecuencia = 'mensual') {
  if (!monto || !interesMensual || !plazo) return 0;
  const t = tasaPorPeriodo(interesMensual, frecuencia);
  if (t === 0) return monto / plazo;
  const factor = Math.pow(1 + t, plazo);
  return Math.round(monto * (t * factor) / (factor - 1) * 100) / 100;
}

// -------------------------------------------------------
// Controller
// -------------------------------------------------------
const ClienteController = {

  // GET / — lista todos los clientes con semáforo
  async findAll(req, res) {
    try {
      const clientes = await prisma.clientes.findMany({ orderBy: { id: 'asc' } });

      const data = await Promise.all(
        clientes.map(async c => ({
          ...c,
          condicion: await calcularCondicionCliente(c.id)
        }))
      );

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error al listar clientes:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // GET /:id — detalle completo: semáforo + historial de préstamos
  async findById(req, res) {
    try {
      const id = parseInt(req.params.id);

      const cliente = await prisma.clientes.findUnique({
        where: { id },
        include: {
          prestamos: {
            where: { deleted_at: null },
            orderBy: { created_at: 'desc' },
            include: {
              tipos_prestamo: { select: { nombre: true } },
              planes_pago:    { select: { nombre: true } },
              cuotas:         { orderBy: { numero: 'asc' } },
              moras:          { where: { estado: 'activa' } }
            }
          },
          referencias: true
        }
      });

      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

      const condicion = await calcularCondicionCliente(id);

      const hoy = new Date();

      const historial = cliente.prestamos.map(p => {
        const frecuencia  = p.frecuencia_pago || 'mensual';
        const periodos    = p.plazo_original || p.plazo;
        const cuotaValor  = calcCuota(Number(p.monto), Number(p.interes), periodos, frecuencia);
        const totalMora   = p.moras.reduce((s, m) => s + Number(m.monto || 0), 0);
        const saldoActual = Number(p.saldo_actual ?? p.monto);

        const cuotasPagadas    = p.cuotas.filter(c => c.estado === 'pagado').length;
        const cuotasPendientes = p.cuotas.filter(c => c.estado === 'pendiente').length;
        const cuotasAtrasadas  = p.cuotas.filter(c => c.estado === 'atrasado').length;
        const cuotasVencidas   = p.cuotas.filter(
          c => c.estado !== 'pagado' && new Date(c.fecha_vencimiento) < hoy
        ).length;

        return {
          id:              p.id,
          monto:           Number(p.monto),
          interes:         Number(p.interes),
          plazo:           p.plazo,
          plazo_original:  p.plazo_original,
          frecuencia_pago: frecuencia,
          estado:          p.estado,
          fecha_inicio:    p.fecha_inicio,
          saldo_actual:    saldoActual,
          cuota_periodo:   cuotaValor,
          total_pagado:    Number(p.monto) - saldoActual,
          total_mora:      totalMora,
          tipo_prestamo:   p.tipos_prestamo?.nombre || null,
          plan_pago:       p.planes_pago?.nombre    || null,
          resumen_cuotas: {
            total:      p.cuotas.length,
            pagadas:    cuotasPagadas,
            pendientes: cuotasPendientes,
            atrasadas:  cuotasAtrasadas,
            vencidas:   cuotasVencidas
          },
          cuotas: p.cuotas.map(c => ({
            id:                c.id,
            numero:            c.numero,
            monto:             Number(c.monto),
            monto_pagado:      Number(c.monto_pagado || 0),
            fecha_vencimiento: c.fecha_vencimiento,
            fecha_pago:        c.fecha_pago,
            estado:            c.estado
          }))
        };
      });

      const prestamosActivos = historial.filter(p => ['activo', 'atrasado', 'aprobado'].includes(p.estado));
      const prestamosPagados = historial.filter(p => p.estado === 'pagado');
      const deudaTotal       = prestamosActivos.reduce((s, p) => s + p.saldo_actual, 0);
      const moraTotal        = historial.reduce((s, p) => s + p.total_mora, 0);

      res.json({
        success: true,
        data: {
          id:          cliente.id,
          nombre:      cliente.nombre,
          cedula:      cliente.cedula,
          telefono:    cliente.telefono,
          email:       cliente.email,
          direccion:   cliente.direccion,
          estado:      cliente.estado,
          created_at:  cliente.created_at,
          referencias: cliente.referencias,
          condicion,
          resumen: {
            total_prestamos:     historial.length,
            prestamos_activos:   prestamosActivos.length,
            prestamos_pagados:   prestamosPagados.length,
            deuda_total:         parseFloat(deudaTotal.toFixed(2)),
            mora_total:          parseFloat(moraTotal.toFixed(2)),
            apto_nuevo_prestamo: condicion.color !== 'rojo'
          },
          historial_prestamos: historial
        }
      });
    } catch (error) {
      console.error('Error en GET /clientes/:id:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async create(req, res) {
    try {
      const { nombre, cedula, telefono, email, direccion, estado } = req.body;

      if (!cedula) return res.status(400).json({ success: false, message: 'La cédula es requerida' });

      const existente = await prisma.clientes.findFirst({ where: { cedula } });
      if (existente) return res.status(400).json({ success: false, message: 'Ya existe un cliente con esta cédula' });

      const cliente = await prisma.clientes.create({
        data: { nombre, cedula, telefono, email, direccion, estado: estado || 'activo' }
      });

      res.status(201).json({ success: true, data: cliente });
    } catch (error) {
      console.error('Error al crear cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, cedula, telefono, email, direccion, estado } = req.body;

      const updateData = {};
      if (nombre    !== undefined) updateData.nombre    = nombre;
      if (cedula    !== undefined) updateData.cedula    = cedula;
      if (telefono  !== undefined) updateData.telefono  = telefono;
      if (email     !== undefined) updateData.email     = email;
      if (direccion !== undefined) updateData.direccion = direccion;
      if (estado    !== undefined) updateData.estado    = estado;

      const cliente = await prisma.clientes.update({ where: { id: parseInt(id) }, data: updateData });
      res.json({ success: true, data: cliente });
    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      const activos = await prisma.prestamos.count({
        where: { cliente_id: parseInt(id), estado: { in: ['activo', 'atrasado', 'aprobado'] }, deleted_at: null }
      });
      if (activos > 0) {
        return res.status(400).json({ success: false, message: 'No se puede eliminar: el cliente tiene préstamos activos' });
      }

      await prisma.clientes.delete({ where: { id: parseInt(id) } });
      res.json({ success: true, message: 'Cliente eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = ClienteController;
