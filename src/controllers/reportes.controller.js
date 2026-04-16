// src/controllers/reportes.controller.js
const service = require("../services/reportes.service");

exports.cajaPDF = async (req, res, next) => {
  try {
    await service.reporteCajaPDF(Number(req.params.id), res);
  } catch (err) {
    next(err);
  }
};

exports.morososExcel = async (req, res, next) => {
  try {
    await service.reporteMorososExcel(res);
  } catch (err) {
    next(err);
  }
};