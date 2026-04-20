const prisma = require('../config/prisma');

const ClienteService = {
  async create(data) {
    try {
      console.log('📝 Creando cliente con datos:', { nombre: data.nombre, cedula: data.cedula });

      // ✅ VALIDACIÓN 1: Cédula requerida
      if (!data.cedula) {
        throw new Error('La cédula es requerida');
      }

      // ✅ VALIDACIÓN 2: Formato de cédula (solo números, 7-8 dígitos)
     const cedulaRegex = /^[0-9]{11}$/;
if (!cedulaRegex.test(data.cedula)) {
  throw new Error('Cédula inválida. Debe contener exactamente 11 dígitos');
}

      // ✅ VALIDACIÓN 3: Verificar si ya existe un cliente con la misma cédula
      const existingCliente = await prisma.clientes.findFirst({
        where: {
          cedula: data.cedula
        }
      });

      if (existingCliente) {
        throw new Error(`Ya existe un cliente registrado con la cédula ${data.cedula}`);
      }

      // ✅ VALIDACIÓN 4: Nombre requerido
      if (!data.nombre || data.nombre.trim().length < 3) {
        throw new Error('El nombre es requerido y debe tener al menos 3 caracteres');
      }

      // ✅ VALIDACIÓN 5: Formato de email (si se proporciona)
      if (data.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          throw new Error('Email inválido');
        }

        const existingEmail = await prisma.clientes.findFirst({
          where: {
            email: data.email
          }
        });

        if (existingEmail) {
          throw new Error(`Ya existe un cliente registrado con el email ${data.email}`);
        }
      }

      // ✅ VALIDACIÓN 6: Formato de teléfono (opcional)
      if (data.telefono) {
        const telefonoLimpio = data.telefono.replace(/[-()\s]/g, '');
        const telefonoRegex = /^[0-9]{10,15}$/;
        if (!telefonoRegex.test(telefonoLimpio)) {
          throw new Error('Teléfono inválido. Debe contener solo números (10-15 dígitos)');
        }
      }

      // Crear el cliente
      const cliente = await prisma.clientes.create({
        data: {
          nombre: data.nombre.trim(),
          cedula: data.cedula,
          telefono: data.telefono || null,
          email: data.email || null,
          direccion: data.direccion || null,
          estado: data.estado || 'activo'
        }
      });

      return {
        success: true,
        message: 'Cliente creado exitosamente',
        data: cliente
      };
    } catch (error) {
      console.error('❌ Error en ClienteService.create:', error.message);
      throw error;
    }
  },

  async update(id, data) {
    try {
      // Validar formato de cédula si se está actualizando
      if (data.cedula) {
        const cedulaRegex = /^[0-9]{7,8}$/;
        if (!cedulaRegex.test(data.cedula)) {
          throw new Error('Cédula inválida. Debe tener 7 u 8 dígitos');
        }

        const existingCliente = await prisma.clientes.findFirst({
          where: {
            cedula: data.cedula,
            id: { not: parseInt(id) }
          }
        });

        if (existingCliente) {
          throw new Error(`Ya existe otro cliente con la cédula ${data.cedula}`);
        }
      }

      // Validar formato de email si se está actualizando
      if (data.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          throw new Error('Email inválido');
        }

        const existingEmail = await prisma.clientes.findFirst({
          where: {
            email: data.email,
            id: { not: parseInt(id) }
          }
        });

        if (existingEmail) {
          throw new Error(`Ya existe otro cliente con el email ${data.email}`);
        }
      }

      const cliente = await prisma.clientes.update({
        where: { id: parseInt(id) },
        data: {
          nombre: data.nombre,
          cedula: data.cedula,
          telefono: data.telefono,
          email: data.email,
          direccion: data.direccion,
          estado: data.estado
        }
      });

      return {
        success: true,
        message: 'Cliente actualizado exitosamente',
        data: cliente
      };
    } catch (error) {
      throw error;
    }
  },

  async findAll() {
    try {
      const clientes = await prisma.clientes.findMany({
        orderBy: { created_at: 'desc' }
      });
      return {
        success: true,
        data: clientes
      };
    } catch (error) {
      throw error;
    }
  },

  async findById(id) {
    try {
      const cliente = await prisma.clientes.findUnique({
        where: { id: parseInt(id) }
      });

      if (!cliente) {
        throw new Error('Cliente no encontrado');
      }

      return {
        success: true,
        data: cliente
      };
    } catch (error) {
      throw error;
    }
  },

  async delete(id) {
    try {
      const prestamos = await prisma.prestamos.findMany({
        where: { 
          cliente_id: parseInt(id),
          estado: { in: ['aprobado', 'activo', 'pendiente'] }
        }
      });

      if (prestamos.length > 0) {
        throw new Error('No se puede eliminar el cliente porque tiene préstamos activos');
      }

      await prisma.clientes.delete({
        where: { id: parseInt(id) }
      });

      return {
        success: true,
        message: 'Cliente eliminado exitosamente'
      };
    } catch (error) {
      throw error;
    }
  }
};

module.exports = ClienteService;