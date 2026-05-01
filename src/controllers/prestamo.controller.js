const prestamoService = require('../services/prestamo.service');

const PrestamoController = {
  async listar(req, res) {
    try {
      const prestamos = await prestamoService.listarPrestamos();
      res.json({ success: true, data: prestamos });
    } catch (error) {
      console.error('Error en listar préstamos:', error);
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  },

  async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const prestamo = await prestamoService.obtenerPrestamoPorId(id);
      res.json({ success: true, data: prestamo });
    } catch (error) {
      console.error('Error en obtener préstamo:', error);
      if (error.message === 'Préstamo no encontrado') {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async crear(req, res) {
    try {
      const prestamo = await prestamoService.crearPrestamo(req.body);
      res.status(201).json({
        success: true,
        message: 'Préstamo creado exitosamente',
        data: prestamo
      });
    } catch (error) {
      console.error('Error en crear préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const prestamo = await prestamoService.actualizarPrestamo(id, req.body);
      res.json({ success: true, message: 'Préstamo actualizado', data: prestamo });
    } catch (error) {
      console.error('Error en actualizar préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const { id } = req.params;
      await prestamoService.eliminarPrestamo(id);
      res.json({ success: true, message: 'Préstamo eliminado' });
    } catch (error) {
      console.error('Error en eliminar préstamo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async registrarPago(req, res) {
    try {
      const { id, cuotaId } = req.params;
      const result = await prestamoService.registrarPago(id, cuotaId, {
        ...req.body,
        usuario_id: req.user?.id
      });
      res.json(result);
    } catch (error) {
      console.error('Error registrando pago:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async actualizarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;
      const prestamo = await prestamoService.actualizarEstadoPrestamo(id, estado);
      res.json({
        success: true,
        message: 'Estado actualizado exitosamente',
        data: { id: prestamo.id, estado: prestamo.estado }
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
};

module.exports = PrestamoController;
