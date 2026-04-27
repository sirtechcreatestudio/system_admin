// src/services/cliente.service.js
// CORRECCIONES:
// 1. Validación de cédula inconsistente: create validaba 11 dígitos, update validaba 7-8.
//    Unificado a 11 dígitos (cédula dominicana estándar) en ambos métodos.
// 2. update() no filtraba campos undefined — podía sobreescribir datos con null
//    si el frontend no enviaba todos los campos.

const prisma = require('../config/prisma');

const CEDULA_REGEX   = /^[0-9]{11}$/;
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_REGEX = /^[0-9]{10,15}$/;

const ClienteService = {

  async create(data) {
    if (!data.cedula) throw new Error('La cédula es requerida');
    if (!CEDULA_REGEX.test(data.cedula)) {
      throw new Error('Cédula inválida. Debe contener exactamente 11 dígitos');
    }

    const cedulaExistente = await prisma.clientes.findFirst({ where: { cedula: data.cedula } });
    if (cedulaExistente) throw new Error(`Ya existe un cliente con la cédula ${data.cedula}`);

    if (!data.nombre || data.nombre.trim().length < 3) {
      throw new Error('El nombre es requerido y debe tener al menos 3 caracteres');
    }

    if (data.email) {
      if (!EMAIL_REGEX.test(data.email)) throw new Error('Email inválido');
      const emailExistente = await prisma.clientes.findFirst({ where: { email: data.email } });
      if (emailExistente) throw new Error(`Ya existe un cliente con el email ${data.email}`);
    }

    if (data.telefono) {
      const tel = data.telefono.replace(/[-()\s]/g, '');
      if (!TELEFONO_REGEX.test(tel)) {
        throw new Error('Teléfono inválido. Debe contener solo números (10-15 dígitos)');
      }
    }

    const cliente = await prisma.clientes.create({
      data: {
        nombre:    data.nombre.trim(),
        cedula:    data.cedula,
        telefono:  data.telefono || null,
        email:     data.email    || null,
        direccion: data.direccion || null,
        estado:    data.estado   || 'activo'
      }
    });

    return { success: true, message: 'Cliente creado exitosamente', data: cliente };
  },

  async update(id, data) {
    // CORRECCIÓN: validar cédula con 11 dígitos (igual que create)
    if (data.cedula) {
      if (!CEDULA_REGEX.test(data.cedula)) {
        throw new Error('Cédula inválida. Debe contener exactamente 11 dígitos');
      }
      const existingCliente = await prisma.clientes.findFirst({
        where: { cedula: data.cedula, id: { not: parseInt(id) } }
      });
      if (existingCliente) throw new Error(`Ya existe otro cliente con la cédula ${data.cedula}`);
    }

    if (data.email) {
      if (!EMAIL_REGEX.test(data.email)) throw new Error('Email inválido');
      const existingEmail = await prisma.clientes.findFirst({
        where: { email: data.email, id: { not: parseInt(id) } }
      });
      if (existingEmail) throw new Error(`Ya existe otro cliente con el email ${data.email}`);
    }

    // CORRECCIÓN: solo actualizar campos que realmente vienen en el request
    const updateData = {};
    if (data.nombre    !== undefined) updateData.nombre    = data.nombre;
    if (data.cedula    !== undefined) updateData.cedula    = data.cedula;
    if (data.telefono  !== undefined) updateData.telefono  = data.telefono;
    if (data.email     !== undefined) updateData.email     = data.email;
    if (data.direccion !== undefined) updateData.direccion = data.direccion;
    if (data.estado    !== undefined) updateData.estado    = data.estado;

    const cliente = await prisma.clientes.update({
      where: { id: parseInt(id) },
      data:  updateData
    });

    return { success: true, message: 'Cliente actualizado exitosamente', data: cliente };
  },

  async findAll() {
    const clientes = await prisma.clientes.findMany({ orderBy: { created_at: 'desc' } });
    return { success: true, data: clientes };
  },

  async findById(id) {
    const cliente = await prisma.clientes.findUnique({ where: { id: parseInt(id) } });
    if (!cliente) throw new Error('Cliente no encontrado');
    return { success: true, data: cliente };
  },

  async delete(id) {
    const prestamos = await prisma.prestamos.findMany({
      where: {
        cliente_id: parseInt(id),
        estado: { in: ['aprobado', 'activo', 'pendiente'] }
      }
    });
    if (prestamos.length > 0) {
      throw new Error('No se puede eliminar el cliente porque tiene préstamos activos');
    }
    await prisma.clientes.delete({ where: { id: parseInt(id) } });
    return { success: true, message: 'Cliente eliminado exitosamente' };
  }
};

module.exports = ClienteService;