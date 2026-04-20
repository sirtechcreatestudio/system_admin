// src/controllers/prestamo.controller.js
// Corregido: sin created_by (no existe en schema), usa connect para relaciones
const prisma = require('../config/prisma');

function calcularCuota(monto, interesAnual, plazoMeses) {
  if (!monto || !interesAnual || !plazoMeses || monto <= 0 || interesAnual <= 0 || plazoMeses <= 0) return 0;
  const tasaMensual = interesAnual / 100 / 12;
  const cuota = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
  return Math.round(cuota * 100) / 100;
}

const PrestamoController = {
  async listar(req, res) {
    try {
      const prestamos = await prisma.prestamos.findMany({
        include: {
          clientes: { select: { id: true, nombre: true, cedula: true, telefono: true, email: true } }
        },
        orderBy: { id: 'asc' }
      });
      const data = prestamos.map(p => ({
        id: p.id,
        cliente: p.clientes
          ? { id: p.clientes.id, nombre: p.clientes.nombre, cedula: p.clientes.cedula, telefono: p.clientes.telefono, email: p.clientes.email }
          : { nombre: 'Sin cliente', cedula: '' },
        monto: Number(p.monto),
        interes: Number(p.interes),
        plazo: p.plazo,
        estado: p.estado,
        fecha_inicio: p.fecha_inicio,
        cuota_mensual: calcularCuota(Number(p.monto), Number(p.interes), p.plazo)
      }));
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error en listar préstamos:', error);
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  },

  async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const prestamo = await prisma.prestamos.findUnique({
        where: { id: parseInt(id) },
        include: {
          clientes: true,
          cuotas: { orderBy: { numero: 'asc' } }
        }
      });
      if (!prestamo) return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
      res.json({
        success: true,
        data: {
          ...prestamo,
          cliente: prestamo.clientes,
          cuota_mensual: calcularCuota(Number(prestamo.monto), Number(prestamo.interes), prestamo.plazo)
        }
      });
    } catch (error) {
      console.error('Error en obtener préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { cliente_id, monto, interes, plazo, tipo_prestamo_id, plan_pago_id, fecha_inicio } = req.body;
      if (!cliente_id || !monto || !interes || !plazo) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
      }

      // Usar connect para relaciones — nunca IDs directos en campos de relación
      const createData = {
        clientes:    { connect: { id: parseInt(cliente_id) } },
        monto:       parseFloat(monto),
        interes:     parseFloat(interes),
        plazo:       parseInt(plazo),
        estado:      'pendiente',
        fecha_inicio: fecha_inicio ? new Date(fecha_inicio) : new Date()
      };
      if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
        createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
      }
      if (plan_pago_id && parseInt(plan_pago_id) > 0) {
        createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
      }

      const prestamo = await prisma.prestamos.create({ data: createData });
      res.status(201).json({ success: true, message: 'Préstamo creado exitosamente', data: prestamo });
    } catch (error) {
      console.error('Error en crear préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = PrestamoController;
