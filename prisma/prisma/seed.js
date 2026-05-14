// prisma/seed.js
// Seed completo: roles, permisos, asignaciones y usuario admin

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// ============================================================
// 📋 PERMISOS por módulo
// ============================================================
const PERMISOS = [
  // Dashboard
  { nombre: 'ver_dashboard',       descripcion: 'Ver panel principal',         modulo: 'dashboard' },

  // Clientes
  { nombre: 'ver_clientes',        descripcion: 'Ver lista de clientes',        modulo: 'clientes' },
  { nombre: 'crear_clientes',      descripcion: 'Crear nuevos clientes',        modulo: 'clientes' },
  { nombre: 'editar_clientes',     descripcion: 'Editar clientes existentes',   modulo: 'clientes' },
  { nombre: 'eliminar_clientes',   descripcion: 'Eliminar clientes',            modulo: 'clientes' },

  // Préstamos
  { nombre: 'ver_prestamos',       descripcion: 'Ver lista de préstamos',       modulo: 'prestamos' },
  { nombre: 'crear_prestamos',     descripcion: 'Crear nuevos préstamos',       modulo: 'prestamos' },
  { nombre: 'editar_prestamos',    descripcion: 'Editar préstamos existentes',  modulo: 'prestamos' },
  { nombre: 'aprobar_prestamos',   descripcion: 'Aprobar préstamos',            modulo: 'prestamos' },
  { nombre: 'eliminar_prestamos',  descripcion: 'Eliminar préstamos',           modulo: 'prestamos' },

  // Pagos
  { nombre: 'ver_pagos',           descripcion: 'Ver pagos registrados',        modulo: 'pagos' },
  { nombre: 'registrar_pagos',     descripcion: 'Registrar nuevos pagos',       modulo: 'pagos' },
  { nombre: 'anular_pagos',        descripcion: 'Anular pagos',                 modulo: 'pagos' },

  // Caja
  { nombre: 'ver_caja',            descripcion: 'Ver movimientos de caja',      modulo: 'caja' },
  { nombre: 'abrir_caja',          descripcion: 'Abrir caja del día',           modulo: 'caja' },
  { nombre: 'cerrar_caja',         descripcion: 'Cerrar caja del día',          modulo: 'caja' },

  // Morosos
  { nombre: 'ver_morosos',         descripcion: 'Ver clientes morosos',         modulo: 'morosos' },
  { nombre: 'gestionar_cobros',    descripcion: 'Gestionar gestiones de cobro', modulo: 'morosos' },

  // Reportes
  { nombre: 'ver_reportes',        descripcion: 'Ver reportes generales',       modulo: 'reportes' },
  { nombre: 'exportar_reportes',   descripcion: 'Exportar reportes a PDF/Excel',modulo: 'reportes' },

  // Usuarios
  { nombre: 'ver_usuarios',        descripcion: 'Ver lista de usuarios',        modulo: 'usuarios' },
  { nombre: 'crear_usuarios',      descripcion: 'Crear nuevos usuarios',        modulo: 'usuarios' },
  { nombre: 'editar_usuarios',     descripcion: 'Editar usuarios',              modulo: 'usuarios' },
  { nombre: 'eliminar_usuarios',   descripcion: 'Eliminar usuarios',            modulo: 'usuarios' },

  // Vehículos
  { nombre: 'ver_vehiculos',       descripcion: 'Ver vehículos',                modulo: 'vehiculos' },
  { nombre: 'crear_vehiculos',     descripcion: 'Crear vehículos',              modulo: 'vehiculos' },
  { nombre: 'editar_vehiculos',    descripcion: 'Editar vehículos',             modulo: 'vehiculos' },

  // Contratos
  { nombre: 'ver_contratos',       descripcion: 'Ver contratos',                modulo: 'contratos' },
  { nombre: 'crear_contratos',     descripcion: 'Generar contratos',            modulo: 'contratos' },

  // Catálogos
  { nombre: 'ver_catalogos',       descripcion: 'Ver catálogos del sistema',    modulo: 'catalogos' },
  { nombre: 'editar_catalogos',    descripcion: 'Editar catálogos del sistema', modulo: 'catalogos' },
];

// ============================================================
// 🎭 PERMISOS POR ROL
// ============================================================

// Rol 1: administrador → todos los permisos (se asignan en el código)
// Rol 2: gestor → permisos operativos (sin admin de usuarios/catalogos)
const PERMISOS_GESTOR = [
  'ver_dashboard',
  'ver_clientes', 'crear_clientes', 'editar_clientes',
  'ver_prestamos', 'crear_prestamos', 'editar_prestamos', 'aprobar_prestamos',
  'ver_pagos', 'registrar_pagos',
  'ver_caja', 'abrir_caja', 'cerrar_caja',
  'ver_morosos', 'gestionar_cobros',
  'ver_reportes', 'exportar_reportes',
  'ver_vehiculos',
  'ver_contratos', 'crear_contratos',
];

// Rol 3: usuario → solo lectura + operaciones básicas
const PERMISOS_USUARIO = [
  'ver_dashboard',
  'ver_clientes',
  'ver_prestamos',
  'ver_pagos', 'registrar_pagos',
  'ver_caja',
  'ver_morosos',
  'ver_reportes',
  'ver_vehiculos',
];

async function main() {
  console.log('🌱 Ejecutando seed completo...\n');

  // ── Roles ──────────────────────────────────────────────────
  const roles = [
    { id: 1, nombre: 'administrador', descripcion: 'Acceso total al sistema' },
    { id: 2, nombre: 'gestor',        descripcion: 'Gestión operativa de préstamos' },
    { id: 3, nombre: 'usuario',       descripcion: 'Acceso básico de consulta' },
  ];

  for (const role of roles) {
    await prisma.roles.upsert({
      where: { id: role.id },
      update: { nombre: role.nombre, descripcion: role.descripcion },
      create: role,
    });
  }
  console.log('✅ Roles creados');

  // ── Permisos ───────────────────────────────────────────────
  const permisosCreados = [];
  for (const permiso of PERMISOS) {
    const p = await prisma.permisos.upsert({
      where:  { nombre: permiso.nombre },
      update: { descripcion: permiso.descripcion, modulo: permiso.modulo },
      create: permiso,
    });
    permisosCreados.push(p);
  }
  console.log(`✅ ${permisosCreados.length} permisos creados/actualizados`);

  // Helper para buscar permiso por nombre
  const getPermiso = (nombre) => permisosCreados.find(p => p.nombre === nombre);

  // ── Asignar permisos al rol: administrador (todos) ─────────
  for (const permiso of permisosCreados) {
    await prisma.rol_permisos.upsert({
      where:  { rol_id_permiso_id: { rol_id: 1, permiso_id: permiso.id } },
      update: {},
      create: { rol_id: 1, permiso_id: permiso.id },
    });
  }
  console.log('✅ Permisos asignados a administrador (todos)');

  // ── Asignar permisos al rol: gestor ───────────────────────
  for (const nombrePermiso of PERMISOS_GESTOR) {
    const permiso = getPermiso(nombrePermiso);
    if (!permiso) continue;
    await prisma.rol_permisos.upsert({
      where:  { rol_id_permiso_id: { rol_id: 2, permiso_id: permiso.id } },
      update: {},
      create: { rol_id: 2, permiso_id: permiso.id },
    });
  }
  console.log('✅ Permisos asignados a gestor');

  // ── Asignar permisos al rol: usuario ──────────────────────
  for (const nombrePermiso of PERMISOS_USUARIO) {
    const permiso = getPermiso(nombrePermiso);
    if (!permiso) continue;
    await prisma.rol_permisos.upsert({
      where:  { rol_id_permiso_id: { rol_id: 3, permiso_id: permiso.id } },
      update: {},
      create: { rol_id: 3, permiso_id: permiso.id },
    });
  }
  console.log('✅ Permisos asignados a usuario');

  // ── Usuario admin ──────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Stream2011@', 10);

  await prisma.usuarios.upsert({
    where:  { email: 'yrodriguez@caribeazul.com' },
    update: {},
    create: {
      nombre:   'Yovanny Rodriguez',
      email:    'yrodriguez@caribeazul.com',
      password: hashedPassword,
      rol_id:   1,
      estado:   'activo',
    },
  });

  // console.log('\n✅ Usuario admin listo');
  // console.log('📧 Email   : yrodriguez@caribeazul.com');
  // console.log('🔑 Password: Stream2011@');
  // console.log('\n🎉 Seed completado exitosamente');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
