// src/services/auth.service.js
// CORRECCIÓN: importaba desde '../config/database' en vez de '../config/prisma'
// Eso causa que el servicio use una instancia diferente (o rota) de Prisma.

const prisma = require('../config/prisma');  // ← CORREGIDO
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_this';

const authService = {
  async register({ nombre, email, password, rol_id }) {
    const existingUser = await prisma.usuarios.findUnique({ where: { email } });
    if (existingUser) throw new Error('El email ya está registrado');

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
        roles: { select: { nombre: true } }
      }
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, rol_id: newUser.rol_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return {
      success: true,
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id:      newUser.id,
        nombre:  newUser.nombre,
        email:   newUser.email,
        rol_id:  newUser.rol_id,
        rol:     newUser.roles?.nombre,
        estado:  newUser.estado
      }
    };
  },

  async login(email, password) {
    const usuario = await prisma.usuarios.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            rol_permisos: {
              include: { permisos: true }
            }
          }
        }
      }
    });

    if (!usuario) throw new Error('Credenciales inválidas');
    if (usuario.estado !== 'activo') throw new Error('Usuario inactivo. Contacte al administrador.');

    const isValidPassword = await bcrypt.compare(password, usuario.password);
    if (!isValidPassword) throw new Error('Credenciales inválidas');

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol_id: usuario.rol_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const permisos = usuario.roles?.rol_permisos?.map(rp => rp.permisos.nombre) || [];

    return {
      success: true,
      message: 'Login exitoso',
      token,
      user: {
        id:       usuario.id,
        nombre:   usuario.nombre,
        email:    usuario.email,
        rol_id:   usuario.rol_id,
        rol:      usuario.roles?.nombre,
        estado:   usuario.estado,
        permisos
      }
    };
  },

  async getProfile(userId) {
    const usuario = await prisma.usuarios.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            rol_permisos: {
              include: { permisos: true }
            }
          }
        }
      }
    });

    if (!usuario) throw new Error('Usuario no encontrado');

    const permisos = usuario.roles?.rol_permisos?.map(rp => rp.permisos.nombre) || [];
    const { password, ...usuarioSinPassword } = usuario;

    return { ...usuarioSinPassword, permisos };
  }
};

module.exports = authService;