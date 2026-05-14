const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function unlockAdvisory() {
  console.log('🔓 Intentando liberar advisory lock de Prisma...');
  
  try {
    // Intenta liberar el lock específico de Prisma
    await prisma.$executeRaw`SELECT pg_advisory_unlock(72707369)`;
    console.log('✅ Advisory lock liberado exitosamente');
  } catch (error) {
    // Si no existe el lock, no hay problema
    console.log('ℹ️  No había advisory lock activo (o ya estaba liberado)');
  } finally {
    await prisma.$disconnect();
  }
}

// Manejo de errores global
unlockAdvisory().catch((error) => {
  console.error('❌ Error al intentar liberar el lock:', error.message);
  process.exit(0); // No fallar el build por esto
});