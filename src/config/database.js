const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error']
});

// Verificar conexión
prisma.$connect()
  .then(() => console.log('✅ Base de datos conectada'))
  .catch(err => console.error('❌ Error de conexión DB:', err));

module.exports = prisma;