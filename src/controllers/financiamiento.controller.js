'use strict';

// src/controllers/financiamiento.controller.js
const svc = require('../services/financiamiento.service');

// ─── GET /api/v1/financiamiento ───────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { estado, vendedor, busqueda, page, limit } = req.query;
    const resultado = await svc.listar({ estado, vendedor, busqueda, page, limit });
    res.json({ success: true, ...resultado });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/financiamiento/stats ────────────────────────────────────────
const stats = async (req, res, next) => {
  try {
    const data = await svc.obtenerStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/financiamiento/:id ──────────────────────────────────────────
const obtenerPorId = async (req, res, next) => {
  try {
    const financiamiento = await svc.obtenerPorId(req.params.id);
    if (!financiamiento) {
      return res.status(404).json({ success: false, message: 'Financiamiento no encontrado' });
    }
    res.json({ success: true, data: financiamiento });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/v1/financiamiento ──────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { cliente, garante, vehiculo, prestamo, terminosLegales, notario, fechaContrato, vendedor } = req.body;

    // Validar campos requeridos
    const faltantes = Object.entries({ cliente, garante, vehiculo, prestamo, terminosLegales, notario, fechaContrato, vendedor })
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (faltantes.length) {
      return res.status(400).json({
        success : false,
        message : 'Campos requeridos faltantes',
        campos  : faltantes,
      });
    }

    // Validar datos mínimos del cliente
    if (!cliente.nombre || !cliente.cedula || !cliente.telefono || !cliente.direccion) {
      return res.status(400).json({ success: false, message: 'Datos del cliente incompletos' });
    }

    // Validar referencias mínimas (2 por cliente y garante)
    const refsCliente = (cliente.referencias || []).filter(r => r.nombre);
    const refsGarante = (garante.referencias || []).filter(r => r.nombre);

    if (refsCliente.length < 2) {
      return res.status(400).json({ success: false, message: 'El cliente debe tener mínimo 2 referencias' });
    }
    if (refsGarante.length < 2) {
      return res.status(400).json({ success: false, message: 'El garante debe tener mínimo 2 referencias' });
    }

    // Validar datos del préstamo
    if (!prestamo.montoFinanciar || !prestamo.tasaInteres || !prestamo.numeroCuotas || !prestamo.fechaInicio) {
      return res.status(400).json({ success: false, message: 'Datos del préstamo incompletos' });
    }

    const usuarioId = req.user?.id || null;
    const nuevo     = await svc.crear(req.body, usuarioId);

    res.status(201).json({ success: true, data: nuevo });
  } catch (err) {
    // Número de contrato duplicado (Prisma unique constraint)
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Conflicto al generar número de contrato, reintenta.' });
    }
    next(err);
  }
};

// ─── PATCH /api/v1/financiamiento/:id ────────────────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const actualizado = await svc.actualizar(req.params.id, req.body);
    if (!actualizado) {
      return res.status(404).json({ success: false, message: 'Financiamiento no encontrado' });
    }
    res.json({ success: true, data: actualizado });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/v1/financiamiento/:id ───────────────────────────────────────
const eliminar = async (req, res, next) => {
  try {
    const ok = await svc.eliminar(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Financiamiento no encontrado' });
    }
    res.json({ success: true, message: 'Financiamiento eliminado correctamente' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listar, stats, obtenerPorId, crear, actualizar, eliminar };