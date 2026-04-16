const prisma = require('../config/database');

// Middleware para verificar permisos específicos
const authorize = (permisoRequerido = null) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      // Obtener usuario con su rol y permisos
      const usuario = await prisma.usuarios.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              rol_permisos: {
                include: {
                  permisos: true
                }
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

      // Si es admin (rol_id = 1), tiene todos los permisos
      if (usuario.rol_id === 1) {
        req.user.rol = 'admin';
        req.user.permisos = ['*']; // Todos los permisos
        return next();
      }

      // Si no se requiere permiso específico, solo verificamos que esté autenticado
      if (!permisoRequerido) {
        req.user.rol = usuario.roles?.nombre || 'usuario';
        req.user.permisos = usuario.roles?.rol_permisos?.map(rp => rp.permisos.nombre) || [];
        return next();
      }

      // Verificar permiso específico
      const tienePermiso = usuario.roles?.rol_permisos?.some(
        rp => rp.permisos.nombre === permisoRequerido
      );

      if (!tienePermiso) {
        return res.status(403).json({
          success: false,
          message: `No tienes permiso para: ${permisoRequerido}`
        });
      }

      req.user.rol = usuario.roles?.nombre || 'usuario';
      req.user.permisos = usuario.roles?.rol_permisos?.map(rp => rp.permisos.nombre) || [];
      
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
    const userRole = req.user.rol;
    
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