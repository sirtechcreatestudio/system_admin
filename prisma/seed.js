const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Ejecutando seed...');
  
  // Crear roles
  const roles = [
    { id: 1, nombre: 'administrador', descripcion: 'Acceso total' },
    { id: 2, nombre: 'gestor', descripcion: 'Gestión de préstamos' },
    { id: 3, nombre: 'usuario', descripcion: 'Usuario básico' }
  ];
  
  for (const role of roles) {
    await prisma.roles.upsert({
      where: { id: role.id },
      update: {},
      create: role
    });
  }
  console.log('✅ Roles creados');
  
  // Crear usuario admin
  const hashedPassword = await bcrypt.hash('Stream2011@', 10);
  
  await prisma.usuarios.upsert({
    where: { email: 'yrodriguez@caribeazul.com' },
    update: {},
    create: {
      nombre: 'Y Rodriguez',
      email: 'yrodriguez@caribeazul.com',
      password: hashedPassword,
      rol_id: 1,
      estado: 'activo'
    }
  });
  console.log('✅ Usuario admin creado');
  console.log('📧 Email: yrodriguez@caribeazul.com');
  console.log('🔑 Password: Stream2011@');
}

main()
  .catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });