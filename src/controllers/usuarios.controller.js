const prisma = require('../config/database');
const bcrypt = require('bcrypt');

const UsuariosController = {
  async getAll(req, res) {
    try {
      const usuarios = await prisma.usuarios.findMany({
        select: {
          id: true,
          nombre: true,
          email: true,
          estado: true,
          created_at: true,
          rol_id: true,
          roles: {
            select: {
              id: true,
              nombre: true,
              descripcion: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      res.json({
        success: true,
        data: usuarios
      });
    } catch (error) {
      console.error('Error obteniendo usuarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener usuarios: ' + error.message
      });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      
      const usuario = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) },
        select: {
          id: true,
          nombre: true,
          email: true,
          estado: true,
          created_at: true,
          rol_id: true,
          roles: {
            select: {
              id: true,
              nombre: true,
              descripcion: true
            }
          }
        }
      });

      if (!usuario) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      res.json({
        success: true,
        data: usuario
      });
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener usuario: ' + error.message
      });
    }
  },

  async create(req, res) {
    try {
      const { nombre, email, password, rol_id } = req.body;

      if (!nombre || !email || !password || !rol_id) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos'
        });
      }

      const existingUser = await prisma.usuarios.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.usuarios.create({
        data: {
          nombre,
          email,
          password: hashedPassword,
          rol_id: parseInt(rol_id),
          estado: 'activo'
        },
        include: {
          roles: {
            select: {
              nombre: true,
              descripcion: true
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          id: newUser.id,
          nombre: newUser.nombre,
          email: newUser.email,
          estado: newUser.estado,
          rol: newUser.roles?.nombre
        }
      });
    } catch (error) {
      console.error('Error creando usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear usuario: ' + error.message
      });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, email, rol_id, estado, password } = req.body;

      const existingUser = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const updateData = {};
      
      if (nombre) updateData.nombre = nombre;
      if (email) {
        if (email !== existingUser.email) {
          const emailExists = await prisma.usuarios.findFirst({
            where: { email, id: { not: parseInt(id) } }
          });
          if (emailExists) {
            return res.status(400).json({
              success: false,
              message: 'El email ya está en uso'
            });
          }
        }
        updateData.email = email;
      }
      if (rol_id) updateData.rol_id = parseInt(rol_id);
      if (estado) updateData.estado = estado;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.usuarios.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          roles: {
            select: {
              nombre: true,
              descripcion: true
            }
          }
        }
      });

      res.json({
        success: true,
        message: 'Usuario actualizado exitosamente',
        data: {
          id: updatedUser.id,
          nombre: updatedUser.nombre,
          email: updatedUser.email,
          estado: updatedUser.estado,
          rol: updatedUser.roles?.nombre
        }
      });
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar usuario: ' + error.message
      });
    }
  },

  async toggleEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      if (!estado || !['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado inválido. Debe ser "activo" o "inactivo"'
        });
      }

      const updatedUser = await prisma.usuarios.update({
        where: { id: parseInt(id) },
        data: { estado }
      });

      res.json({
        success: true,
        message: `Usuario ${estado === 'activo' ? 'activado' : 'suspendido'} exitosamente`,
        data: {
          id: updatedUser.id,
          estado: updatedUser.estado
        }
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    }
  },

  async changePassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 6 caracteres'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.usuarios.update({
        where: { id: parseInt(id) },
        data: { password: hashedPassword }
      });

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });
    } catch (error) {
      console.error('Error cambiando contraseña:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar contraseña: ' + error.message
      });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      const existingUser = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      await prisma.usuarios.update({
        where: { id: parseInt(id) },
        data: { estado: 'inactivo' }
      });

      res.json({
        success: true,
        message: 'Usuario eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar usuario: ' + error.message
      });
    }
  },

  async getRoles(req, res) {
    try {
      const roles = await prisma.roles.findMany({
        select: {
          id: true,
          nombre: true,
          descripcion: true
        },
        orderBy: { id: 'asc' }
      });

      res.json({
        success: true,
        data: roles
      });
    } catch (error) {
      console.error('Error obteniendo roles:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener roles: ' + error.message
      });
    }
  }
};

module.exports = UsuariosController;