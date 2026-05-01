// src/middleware/authorize.js
// FIX: usa '../config/prisma' (singleton correcto), no '../config/database'

const prisma = require('../config/prisma');

// Middleware para verificar permisos específicos
const authorize = (permisoRequerido = null) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'No autorizado'
        });
      }

      // Obtener usuario con su rol y permisos
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

      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const permisosUsuario = usuario.roles?.rol_permisos?.map(rp => rp.permisos.nombre) || [];

      // Admin (rol_id = 1) tiene acceso total — no consulta permisos
      if (usuario.rol_id === 1) {
        req.user.rol      = usuario.roles?.nombre || 'administrador';
        req.user.permisos = ['*'];
        return next();
      }

      // Sin permiso requerido — solo verifica autenticación
      if (!permisoRequerido) {
        req.user.rol      = usuario.roles?.nombre || 'usuario';
        req.user.permisos = permisosUsuario;
        return next();
      }

      // Verificar permiso específico
      const tienePermiso = permisosUsuario.includes(permisoRequerido);

      if (!tienePermiso) {
        return res.status(403).json({
          success: false,
          message: `No tienes permiso para: ${permisoRequerido}`
        });
      }

      req.user.rol      = usuario.roles?.nombre || 'usuario';
      req.user.permisos = permisosUsuario;

      next();
    } catch (error) {
      console.error('Error en authorize:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos'
      });
    }
  };
};

// Middleware para verificar rol específico
const hasRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    const userRole = req.user?.rol;

    if (!rolesPermitidos.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado - Rol no autorizado'
      });
    }

    next();
  };
};

module.exports = { authorize, hasRole };
