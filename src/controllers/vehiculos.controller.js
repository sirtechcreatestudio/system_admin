const VehiculoService = require('../services/vehiculos.service');

const VehiculoController = {
  async findAll(req, res) {
    try {
      const { estado, tipo, search } = req.query;
      const result = await VehiculoService.findAll({ estado, tipo, search });
      
      // Deshabilitar caché
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.findAll:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Error al listar vehículos' 
      });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const result = await VehiculoService.findById(id);
      res.json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.findById:', error);
      const status = error.message === 'Vehículo no encontrado' ? 404 : 500;
      res.status(status).json({ 
        success: false, 
        message: error.message || 'Error al buscar vehículo' 
      });
    }
  },

  async create(req, res) {
    try {
      const result = await VehiculoService.create(req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.create:', error);
      const status = error.message.includes('requerido') || 
                     error.message.includes('existe') || 
                     error.message.includes('inválido') ? 400 : 500;
      res.status(status).json({ 
        success: false, 
        message: error.message || 'Error al crear vehículo' 
      });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const result = await VehiculoService.update(id, req.body);
      res.json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.update:', error);
      const status = error.message === 'Vehículo no encontrado' ? 404 :
                     error.message.includes('existe') || 
                     error.message.includes('inválido') ? 400 : 500;
      res.status(status).json({ 
        success: false, 
        message: error.message || 'Error al actualizar vehículo' 
      });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await VehiculoService.delete(id);
      res.json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.delete:', error);
      const status = error.message.includes('préstamos') ? 400 : 
                     error.message === 'Vehículo no encontrado' ? 404 : 500;
      res.status(status).json({ 
        success: false, 
        message: error.message || 'Error al eliminar vehículo' 
      });
    }
  },

  async getEstadisticas(req, res) {
    try {
      const result = await VehiculoService.getEstadisticas();
      res.json(result);
    } catch (error) {
      console.error('❌ Error en VehiculoController.getEstadisticas:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Error al obtener estadísticas' 
      });
    }
  }
};

module.exports = VehiculoController;