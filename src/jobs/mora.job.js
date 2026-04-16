// src/jobs/mora.job.js
const cron = require("node-cron");
const moraService = require("../services/mora.service");

// Ejecuta todos los días a las 12 AM
cron.schedule("0 0 * * *", async () => {
  console.log("⏳ Ejecutando motor de mora...");

  try {
    const result = await moraService.aplicarMoraAutomatica();
    console.log(`✅ Mora aplicada a ${result.procesadas} cuotas`);
  } catch (error) {
    console.error("❌ Error en motor de mora:", error);
  }
});