// src/services/reportes.service.js
const prisma = require("../config/prisma");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

// =========================
// 📄 PDF - REPORTE CAJA
// =========================
exports.reporteCajaPDF = async (cajaId, res) => {

  const movimientos = await prisma.movimientos_caja.findMany({
    where: { caja_id: cajaId }
  });

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=reporte_caja.pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Reporte de Caja", { align: "center" });
  doc.moveDown();

  movimientos.forEach(m => {
    doc.fontSize(12).text(
      `${m.tipo.toUpperCase()} - ${m.monto} - ${m.descripcion}`
    );
  });

  doc.end();
};

// =========================
// 📊 EXCEL - MOROSOS
// =========================
exports.reporteMorososExcel = async (res) => {

  const morosos = await prisma.prestamos.findMany({
    where: { tiene_mora: true },
    include: { cliente: true }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Morosos");

  sheet.columns = [
    { header: "Cliente", key: "cliente" },
    { header: "Teléfono", key: "telefono" },
    { header: "Total Mora", key: "mora" }
  ];

  for (const p of morosos) {

    const mora = await prisma.moras.aggregate({
      _sum: { monto: true },
      where: {
        prestamo_id: p.id,
        estado: "activa"
      }
    });

    sheet.addRow({
      cliente: p.cliente.nombre,
      telefono: p.cliente.telefono,
      mora: mora._sum.monto || 0
    });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=morosos.xlsx"
  );

  await workbook.xlsx.write(res);
  res.end();
};