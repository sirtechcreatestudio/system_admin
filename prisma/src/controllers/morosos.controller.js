// src/controllers/morosos.controller.js
const service = require("../services/morosos.service");

exports.getMorosos = async (req, res, next) => {
  try {
    const data = await service.getMorososAvanzado();
    res.json(data);
  } catch (err) {
    next(err);
  }
};