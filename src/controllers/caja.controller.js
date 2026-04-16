// src/controllers/caja.controller.js
const service = require("../services/caja.service");

exports.abrir = async (req, res, next) => {
  try {
    const caja = await service.abrirCaja(req.user.id);
    res.json(caja);
  } catch (err) {
    next(err);
  }
};

exports.cerrar = async (req, res, next) => {
  try {
    const result = await service.cerrarCaja(
      Number(req.params.id),
      req.user.id
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.actual = async (req, res, next) => {
  try {
    const caja = await service.getCajaActual(req.user.id);
    res.json(caja);
  } catch (err) {
    next(err);
  }
};

exports.reporte = async (req, res, next) => {
  try {
    const data = await service.reporteCaja(Number(req.params.id));
    res.json(data);
  } catch (err) {
    next(err);
  }
};