const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de roles y permisos...');

  // 1. Crear roles
  console.log('📌 Creando roles...');
  
  const adminRole = await prisma.roles.upsert({
    where: { nombre: 'admin' },
    update: {},
    create: {
      nombre: 'admin',
      descripcion: 'Administrador del sistema - Acceso total'
    }
  });
  console.log('✅ Rol admin creado');

  const supervisorRole = await prisma.roles.upsert({
    where: { nombre: 'supervisor' },
    update: {},
    create: {
      nombre: 'supervisor',
      descripcion: 'Supervisor - Puede ver reportes y gestionar'
    }
  });
  console.log('✅ Rol supervisor creado');

  const usuarioRole = await prisma.roles.upsert({
    where: { nombre: 'usuario' },
    update: {},
    create: {
      nombre: 'usuario',
      descripcion: 'Usuario regular - Operaciones básicas'
    }
  });
  console.log('✅ Rol usuario creado');

  const cajeroRole = await prisma.roles.upsert({
    where: { nombre: 'cajero' },
    update: {},
    create: {
      nombre: 'cajero',
      descripcion: 'Cajero - Solo puede registrar pagos'
    }
  });
  console.log('✅ Rol cajero creado');

  // 2. Crear permisos
  console.log('📌 Creando permisos...');
  
  const permisosData = [
    // Préstamos
    { nombre: 'crear_prestamo', descripcion: 'Crear nuevos préstamos', modulo: 'prestamos' },
    { nombre: 'editar_prestamo', descripcion: 'Editar préstamos existentes', modulo: 'prestamos' },
    { nombre: 'eliminar_prestamo', descripcion: 'Eliminar préstamos', modulo: 'prestamos' },
    { nombre: 'ver_prestamos', descripcion: 'Ver lista de préstamos', modulo: 'prestamos' },
    
    // Clientes
    { nombre: 'crear_cliente', descripcion: 'Crear nuevos clientes', modulo: 'clientes' },
    { nombre: 'editar_cliente', descripcion: 'Editar clientes', modulo: 'clientes' },
    { nombre: 'eliminar_cliente', descripcion: 'Eliminar clientes', modulo: 'clientes' },
    { nombre: 'ver_clientes', descripcion: 'Ver lista de clientes', modulo: 'clientes' },
    
    // Pagos
    { nombre: 'registrar_pago', descripcion: 'Registrar pagos', modulo: 'pagos' },
    { nombre: 'ver_pagos', descripcion: 'Ver historial de pagos', modulo: 'pagos' },
    { nombre: 'anular_pago', descripcion: 'Anular pagos', modulo: 'pagos' },
    
    // Caja
    { nombre: 'ver_caja', descripcion: 'Ver estado de caja', modulo: 'caja' },
    { nombre: 'abrir_caja', descripcion: 'Abrir caja', modulo: 'caja' },
    { nombre: 'cerrar_caja', descripcion: 'Cerrar caja', modulo: 'caja' },
    { nombre: 'registrar_ingreso', descripcion: 'Registrar ingresos', modulo: 'caja' },
    { nombre: 'registrar_egreso', descripcion: 'Registrar egresos', modulo: 'caja' },
    
    // Reportes
    { nombre: 'ver_reportes', descripcion: 'Ver reportes', modulo: 'reportes' },
    { nombre: 'exportar_reportes', descripcion: 'Exportar reportes', modulo: 'reportes' },
    
    // Usuarios
    { nombre: 'gestionar_usuarios', descripcion: 'Crear/editar/eliminar usuarios', modulo: 'usuarios' },
    { nombre: 'ver_usuarios', descripcion: 'Ver lista de usuarios', modulo: 'usuarios' },
    
    // Dashboard
    { nombre: 'ver_dashboard', descripcion: 'Ver dashboard principal', modulo: 'dashboard' },
    
    // Configuración
    { nombre: 'configurar_sistema', descripcion: 'Configurar parámetros del sistema', modulo: 'configuracion' },
  ];

  for (const permiso of permisosData) {
    await prisma.permisos.upsert({
      where: { nombre: permiso.nombre },
      update: {},
      create: permiso
    });
  }
  console.log(`✅ ${permisosData.length} permisos creados`);

  // 3. Asignar permisos a roles
  console.log('📌 Asignando permisos a roles...');
  
  const todosPermisos = await prisma.permisos.findMany();
  
  // Admin - TODOS los permisos
  for (const permiso of todosPermisos) {
    await prisma.rol_permisos.upsert({
      where: {
        rol_id_permiso_id: {
          rol_id: adminRole.id,
          permiso_id: permiso.id
        }
      },
      update: {},
      create: {
        rol_id: adminRole.id,
        permiso_id: permiso.id
      }
    });
  }
  console.log(`✅ Admin: ${todosPermisos.length} permisos asignados`);

  // Supervisor - Permisos específicos
  const permisosSupervisor = [
    'ver_prestamos', 'crear_prestamo', 'editar_prestamo',
    'ver_clientes', 'crear_cliente', 'editar_cliente',
    'registrar_pago', 'ver_pagos',
    'ver_caja', 'ver_reportes', 'exportar_reportes',
    'ver_dashboard', 'ver_usuarios'
  ];
  
  for (const nombrePermiso of permisosSupervisor) {
    const permiso = todosPermisos.find(p => p.nombre === nombrePermiso);
    if (permiso) {
      await prisma.rol_permisos.upsert({
        where: {
          rol_id_permiso_id: {
            rol_id: supervisorRole.id,
            permiso_id: permiso.id
          }
        },
        update: {},
        create: {
          rol_id: supervisorRole.id,
          permiso_id: permiso.id
        }
      });
    }
  }
  console.log(`✅ Supervisor: ${permisosSupervisor.length} permisos asignados`);

  // Usuario - Permisos básicos
  const permisosUsuario = [
    'ver_prestamos', 'ver_clientes', 
    'registrar_pago', 'ver_pagos',
    'ver_dashboard'
  ];
  
  for (const nombrePermiso of permisosUsuario) {
    const permiso = todosPermisos.find(p => p.nombre === nombrePermiso);
    if (permiso) {
      await prisma.rol_permisos.upsert({
        where: {
          rol_id_permiso_id: {
            rol_id: usuarioRole.id,
            permiso_id: permiso.id
          }
        },
        update: {},
        create: {
          rol_id: usuarioRole.id,
          permiso_id: permiso.id
        }
      });
    }
  }
  console.log(`✅ Usuario: ${permisosUsuario.length} permisos asignados`);

  // Cajero - Solo pagos y caja
  const permisosCajero = [
    'registrar_pago', 'ver_pagos',
    'ver_caja', 'registrar_ingreso',
    'ver_dashboard', 'ver_clientes'
  ];
  
  for (const nombrePermiso of permisosCajero) {
    const permiso = todosPermisos.find(p => p.nombre === nombrePermiso);
    if (permiso) {
      await prisma.rol_permisos.upsert({
        where: {
          rol_id_permiso_id: {
            rol_id: cajeroRole.id,
            permiso_id: permiso.id
          }
        },
        update: {},
        create: {
          rol_id: cajeroRole.id,
          permiso_id: permiso.id
        }
      });
    }
  }
  console.log(`✅ Cajero: ${permisosCajero.length} permisos asignados`);

  // 4. Crear usuarios de prueba
  console.log('📌 Creando usuarios de prueba...');
  
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.usuarios.upsert({
    where: { email: 'admin@sistema.com' },
    update: {},
    create: {
      nombre: 'Administrador',
      email: 'admin@sistema.com',
      password: adminPassword,
      rol_id: adminRole.id,
      estado: 'activo'
    }
  });
  console.log('✅ Usuario admin@sistema.com / admin123');

  const supervisorPassword = await bcrypt.hash('super123', 10);
  await prisma.usuarios.upsert({
    where: { email: 'supervisor@sistema.com' },
    update: {},
    create: {
      nombre: 'Supervisor',
      email: 'supervisor@sistema.com',
      password: supervisorPassword,
      rol_id: supervisorRole.id,
      estado: 'activo'
    }
  });
  console.log('✅ Usuario supervisor@sistema.com / super123');

  const usuarioPassword = await bcrypt.hash('usuario123', 10);
  await prisma.usuarios.upsert({
    where: { email: 'usuario@sistema.com' },
    update: {},
    create: {
      nombre: 'Usuario Regular',
      email: 'usuario@sistema.com',
      password: usuarioPassword,
      rol_id: usuarioRole.id,
      estado: 'activo'
    }
  });
  console.log('✅ Usuario usuario@sistema.com / usuario123');

  const cajeroPassword = await bcrypt.hash('cajero123', 10);
  await prisma.usuarios.upsert({
    where: { email: 'cajero@sistema.com' },
    update: {},
    create: {
      nombre: 'Cajero',
      email: 'cajero@sistema.com',
      password: cajeroPassword,
      rol_id: cajeroRole.id,
      estado: 'activo'
    }
  });
  console.log('✅ Usuario cajero@sistema.com / cajero123');

  console.log('🎉 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });