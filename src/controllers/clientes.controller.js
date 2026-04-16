const prisma = require('../config/prisma');

const ClienteController = {
  async findAll(req, res) {
    try {
      const clientes = await prisma.clientes.findMany({
        orderBy: { id: 'asc' }
      });
      
      // Deshabilitar caché completamente
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({ success: true, data: clientes });
    } catch (error) {
      console.error('Error al listar clientes:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async create(req, res) {
    try {
      const { nombre, cedula, telefono, email, direccion, estado } = req.body;
      
      const existingCliente = await prisma.clientes.findFirst({
        where: { cedula }
      });

      if (existingCliente) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ya existe un cliente con esta cédula' 
        });
      }

      const cliente = await prisma.clientes.create({
        data: {
          nombre,
          cedula,
          telefono,
          email,
          direccion,
          estado: estado || 'activo'
        }
      });

      res.status(201).json({ success: true, data: cliente });
    } catch (error) {
      console.error('Error al crear cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const cliente = await prisma.clientes.findUnique({
        where: { id: parseInt(id) }
      });

      if (!cliente) {
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }

      res.json({ success: true, data: cliente });
    } catch (error) {
      console.error('Error al buscar cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, cedula, telefono, email, direccion, estado } = req.body;

      const cliente = await prisma.clientes.update({
        where: { id: parseInt(id) },
        data: { nombre, cedula, telefono, email, direccion, estado }
      });

      res.json({ success: true, data: cliente });
    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      
      await prisma.clientes.delete({
        where: { id: parseInt(id) }
      });

      res.json({ success: true, message: 'Cliente eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar cliente:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = ClienteController;