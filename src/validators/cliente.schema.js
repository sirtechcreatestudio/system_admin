// src/validators/cliente.schema.js
const { z } = require("zod");

exports.createClienteSchema = z.object({
  nombre: z.string().min(3),
  cedula: z.string().min(5),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  direccion: z.string().optional()
});