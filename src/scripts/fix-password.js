const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  // 1. Asegurar que existe el rol admin
  let rol = await prisma.roles.findFirst({ where: { nombre: 'admin' } });
  if (!rol) {
    rol = await prisma.roles.create({ data: { nombre: 'admin' } });
    console.log('✅ Rol admin creado, id:', rol.id);
  } else {
    console.log('✅ Rol admin existe, id:', rol.id);
  }

  // 2. Usuarios existentes
  const usuarios = await prisma.usuarios.findMany({
    select: { id: true, email: true, estado: true }
  });

  if (usuarios.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    const user = await prisma.usuarios.create({
      data: {
        nombre:   'Administrador',
        email:    'admin@sistema.com',
        password: hash,
        rol_id:   rol.id,
        estado:   'activo'
      }
    });
    console.log('✅ Usuario creado:', user.email, '→ contraseña: admin123');
  } else {
    for (const u of usuarios) {
      const hash = await bcrypt.hash('admin123', 10);
      await prisma.usuarios.update({
        where: { id: u.id },
        data: { password: hash, estado: 'activo', rol_id: rol.id }
      });
      console.log(`✅ [${u.id}] ${u.email} → contraseña: admin123`);
    }
  }
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());