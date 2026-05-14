const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 segundos

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function unlockAdvisory() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(72707369)`;
    console.log('🔓 Lock liberado antes de migrar');
  } catch (e) {
    console.log('ℹ️  No había lock que liberar');
  } finally {
    await prisma.$disconnect();
  }
}

async function runMigration() {
  // Primero intenta liberar cualquier lock existente
  await unlockAdvisory();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n🔄 Intento de migración ${attempt}/${MAX_RETRIES}...`);
    
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        timeout: 30000 // 30 segundos
      });
      
      console.log('✅ Migración exitosa');
      return true;
      
    } catch (error) {
      console.error(`❌ Intento ${attempt} falló:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Esperando ${RETRY_DELAY/1000}s antes del reintento...`);
        await sleep(RETRY_DELAY);
        
        // Intentar liberar el lock antes del siguiente intento
        await unlockAdvisory();
      }
    }
  }
  
  console.error('❌ Todas las migraciones fallaron');
  return false;
}

runMigration().then(success => {
  if (!success) {
    process.exit(1);
  }
});