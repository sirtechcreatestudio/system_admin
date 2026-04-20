// src/validators/prestamo.schema.js
const { z } = require("zod");

exports.createPrestamoSchema = z.object({
  cliente_id: z.number(),
  monto: z.number().positive(),
  interes: z.number().min(0),
  plazo: z.number().min(1),
  tipo_prestamo_id: z.number(),
  plan_pago_id: z.number()
});