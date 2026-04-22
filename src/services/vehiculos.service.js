const prisma = require('../config/prisma');

const VehiculoService = {
  async generarCodigo() {
    const anio = new Date().getFullYear();
    const prefix = `VEH-${anio}-`;
    const ultimo = await prisma.vehiculos.findFirst({
      where: { codigo: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });
    const siguiente = ultimo
      ? parseInt(ultimo.codigo.split('-')[2]) + 1
      : 1;
    return `${prefix}${String(siguiente).padStart(5, '0')}`;
  },

  async findAll(filters = {}) {
    try {
      const { estado, tipo, search } = filters;
      const where = {};
      
      if (estado) where.estado = estado;
      if (tipo) where.tipo = tipo;
      if (search) {
        where.OR = [
          { codigo: { contains: search, mode: 'insensitive' } },
          { marca: { contains: search, mode: 'insensitive' } },
          { modelo: { contains: search, mode: 'insensitive' } },
          { placa: { contains: search, mode: 'insensitive' } },
          { chassis: { contains: search, mode: 'insensitive' } },
        ];
      }

      const vehiculos = await prisma.vehiculos.findMany({
        where,
        include: { 
          clientes: { 
            select: { 
              id: true, 
              nombre: true, 
              cedula: true 
            } 
          } 
        },
        orderBy: { created_at: 'desc' }
      });

      return { success: true, data: vehiculos };
    } catch (error) {
      console.error('❌ Error en VehiculoService.findAll:', error.message);
      throw error;
    }
  },

  async findById(id) {
    try {
      const vehiculo = await prisma.vehiculos.findUnique({
        where: { id: parseInt(id) },
        include: { 
          clientes: { 
            select: { 
              id: true, 
              nombre: true, 
              cedula: true, 
              telefono: true 
            } 
          } 
        }
      });

      if (!vehiculo) {
        throw new Error('Vehículo no encontrado');
      }

      return { success: true, data: vehiculo };
    } catch (error) {
      console.error('❌ Error en VehiculoService.findById:', error.message);
      throw error;
    }
  },

  async create(data) {
    try {
      const { tipo, marca, modelo, anio, color, chassis, placa, precio, detalles, cliente_id } = data;

      // ✅ Validaciones
      if (!marca || marca.trim().length < 2) {
        throw new Error('La marca es requerida y debe tener al menos 2 caracteres');
      }

      if (!modelo || modelo.trim().length < 1) {
        throw new Error('El modelo es requerido');
      }

      if (!anio || anio < 1900 || anio > new Date().getFullYear() + 1) {
        throw new Error(`El año debe estar entre 1900 y ${new Date().getFullYear() + 1}`);
      }

      // ✅ Validar duplicados
      if (chassis) {
        const existe = await prisma.vehiculos.findUnique({ 
          where: { chassis } 
        });
        if (existe) {
          throw new Error(`Ya existe un vehículo con el chassis ${chassis}`);
        }
      }

      if (placa) {
        const placaRegex = /^[A-Z0-9]{5,10}$/i;
        if (!placaRegex.test(placa.replace(/[-\s]/g, ''))) {
          throw new Error('Formato de placa inválido');
        }

        const existe = await prisma.vehiculos.findUnique({ 
          where: { placa } 
        });
        if (existe) {
          throw new Error(`Ya existe un vehículo con la placa ${placa}`);
        }
      }

      // ✅ Validar precio
      if (precio && (isNaN(precio) || parseFloat(precio) < 0)) {
        throw new Error('El precio debe ser un número positivo');
      }

      // ✅ Validar cliente si se proporciona
      if (cliente_id) {
        const cliente = await prisma.clientes.findUnique({
          where: { id: parseInt(cliente_id) }
        });
        if (!cliente) {
          throw new Error('El cliente especificado no existe');
        }
      }

      const codigo = await this.generarCodigo();

      const vehiculo = await prisma.vehiculos.create({
        data: {
          codigo,
          tipo: tipo || 'motor',
          marca: marca.trim(),
          modelo: modelo.trim(),
          anio: parseInt(anio),
          color: color || null,
          chassis: chassis || null,
          placa: placa || null,
          precio: precio ? parseFloat(precio) : null,
          detalles: detalles || null,
          estado: 'disponible',
          ...(cliente_id && { 
            clientes: { 
              connect: { id: parseInt(cliente_id) } 
            } 
          })
        },
        include: {
          clientes: {
            select: { id: true, nombre: true, cedula: true }
          }
        }
      });

      return {
        success: true,
        message: `Vehículo registrado exitosamente — ${codigo}`,
        data: vehiculo
      };
    } catch (error) {
      console.error('❌ Error en VehiculoService.create:', error.message);
      throw error;
    }
  },

  async update(id, data) {
    try {
      const { tipo, marca, modelo, anio, color, chassis, placa, precio, detalles, estado, cliente_id } = data;

      // ✅ Validar que el vehículo existe
      const existente = await prisma.vehiculos.findUnique({
        where: { id: parseInt(id) }
      });

      if (!existente) {
        throw new Error('Vehículo no encontrado');
      }

      // ✅ Validar duplicados en actualización
      if (chassis && chassis !== existente.chassis) {
        const duplicado = await prisma.vehiculos.findFirst({
          where: { 
            chassis,
            id: { not: parseInt(id) }
          }
        });
        if (duplicado) {
          throw new Error(`Ya existe otro vehículo con el chassis ${chassis}`);
        }
      }

      if (placa && placa !== existente.placa) {
        const duplicado = await prisma.vehiculos.findFirst({
          where: { 
            placa,
            id: { not: parseInt(id) }
          }
        });
        if (duplicado) {
          throw new Error(`Ya existe otro vehículo con la placa ${placa}`);
        }
      }

      // ✅ Validar año
      if (anio && (anio < 1900 || anio > new Date().getFullYear() + 1)) {
        throw new Error(`El año debe estar entre 1900 y ${new Date().getFullYear() + 1}`);
      }

      // ✅ Validar precio
      if (precio !== undefined && (isNaN(precio) || parseFloat(precio) < 0)) {
        throw new Error('El precio debe ser un número positivo');
      }

      // ✅ Validar transición de estado
      if (estado === 'vendido' && existente.estado !== 'vendido') {
        // Lógica adicional para cuando se marca como vendido
        console.log(`🚗 Vehículo ${existente.codigo} marcado como vendido`);
      }

      const updateData = {};
      if (tipo) updateData.tipo = tipo;
      if (marca) updateData.marca = marca.trim();
      if (modelo) updateData.modelo = modelo.trim();
      if (anio) updateData.anio = parseInt(anio);
      if (color !== undefined) updateData.color = color || null;
      if (chassis !== undefined) updateData.chassis = chassis || null;
      if (placa !== undefined) updateData.placa = placa || null;
      if (precio !== undefined) updateData.precio = precio ? parseFloat(precio) : null;
      if (detalles !== undefined) updateData.detalles = detalles || null;
      if (estado) updateData.estado = estado;

      if (cliente_id !== undefined) {
        if (cliente_id) {
          const cliente = await prisma.clientes.findUnique({
            where: { id: parseInt(cliente_id) }
          });
          if (!cliente) {
            throw new Error('El cliente especificado no existe');
          }
          updateData.clientes = { connect: { id: parseInt(cliente_id) } };
        } else {
          updateData.clientes = { disconnect: true };
        }
      }

      const vehiculo = await prisma.vehiculos.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          clientes: {
            select: { id: true, nombre: true, cedula: true }
          }
        }
      });

      return {
        success: true,
        message: 'Vehículo actualizado exitosamente',
        data: vehiculo
      };
    } catch (error) {
      console.error('❌ Error en VehiculoService.update:', error.message);
      throw error;
    }
  },

  async delete(id) {
    try {
      // ✅ Verificar si el vehículo tiene préstamos asociados
      const prestamos = await prisma.prestamos.findMany({
        where: { 
          vehiculo_id: parseInt(id),
          estado: { in: ['aprobado', 'activo', 'pendiente'] }
        }
      });

      if (prestamos.length > 0) {
        throw new Error('No se puede eliminar el vehículo porque tiene préstamos activos o pendientes');
      }

      await prisma.vehiculos.delete({
        where: { id: parseInt(id) }
      });

      return {
        success: true,
        message: 'Vehículo eliminado exitosamente'
      };
    } catch (error) {
      console.error('❌ Error en VehiculoService.delete:', error.message);
      throw error;
    }
  },

  async getEstadisticas() {
    try {
      const total = await prisma.vehiculos.count();
      const porEstado = await prisma.vehiculos.groupBy({
        by: ['estado'],
        _count: { id: true }
      });
      const porTipo = await prisma.vehiculos.groupBy({
        by: ['tipo'],
        _count: { id: true }
      });

      return {
        success: true,
        data: {
          total,
          porEstado,
          porTipo
        }
      };
    } catch (error) {
      console.error('❌ Error en VehiculoService.getEstadisticas:', error.message);
      throw error;
    }
  }
};

module.exports = VehiculoService;