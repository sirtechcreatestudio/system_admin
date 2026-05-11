// src/routes/reportes.routes.js
// CORRECCIONES en reporte de préstamos:
// 1. Página en LANDSCAPE para que quepan los nombres completos
// 2. Nombre completo sin truncar (columna más ancha)
// 3. Plazo usa plazo_original cuando está disponible (evita el 0 por conversión a meses equiv.)
// 4. Cuota siempre con 2 decimales fijos (toFixed + format)
// 5. Fuente más grande: headers 10px, datos 9px (era 8/7)
// 6. Cuota usa tasa mensual real del servicio (no anual / 12)

const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.use(authMiddleware);

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function tasaPorFrecuencia(interesMensual, frecuencia = 'mensual') {
  // interes en la BD es mensual (igual que en prestamo.service.js)
  const tasa = interesMensual / 100;
  switch (frecuencia) {
    case 'diaria':    return tasa / 26;   // 26 días hábiles (igual que el service)
    case 'semanal':   return tasa / 4;
    case 'quincenal': return tasa / 2;
    default:          return tasa;
  }
}

function calcularCuota(monto, interesMensual, plazo, frecuencia = 'mensual') {
  if (!monto || !interesMensual || !plazo || monto <= 0 || plazo <= 0) return 0;
  const r = tasaPorFrecuencia(interesMensual, frecuencia);
  if (r === 0) return monto / plazo;
  const factor = Math.pow(1 + r, plazo);
  return monto * (r * factor) / (factor - 1);
}

function formatMoney(n) {
  // Siempre 2 decimales, separador de miles
  return Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function capFirst(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ============================================================
// REPORTE: PRÉSTAMOS (PDF) — LANDSCAPE, nombre completo
// ============================================================
router.get('/prestamos', async (req, res) => {
  try {
    const prestamos = await prisma.prestamos.findMany({
      where: { deleted_at: null },
      include: { clientes: { select: { nombre: true, cedula: true, telefono: true } } },
      orderBy: { id: 'desc' }
    });

    // LANDSCAPE: más ancho para los nombres
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-prestamos.pdf');
    doc.pipe(res);

    // ── ENCABEZADO ──────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text('Reporte de Préstamos', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica')
       .text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── TABLA ───────────────────────────────────────────────
    // A4 landscape útil ≈ 770px (842 - 36*2)
    const startX    = 36;
    const pageW     = doc.page.width - 72;   // 770 aprox
    // Anchos proporcionales al contenido
    const colWidths = [38, 170, 80, 58, 60, 80, 90, 70, 80];
    const headers   = ['ID', 'Cliente', 'Monto', 'Interés', 'Plazo', 'Frecuencia', 'Cuota', 'Saldo', 'Estado'];
    const aligns    = ['center', 'left', 'right', 'center', 'center', 'center', 'right', 'right', 'center'];

    const ROW_H     = 20;
    const HDR_H     = 22;
    const BLUE      = '#1e3a5f';
    const STRIPE    = '#f1f5f9';

    let y = doc.y;

    const drawHeaders = () => {
      // Fondo header
      doc.rect(startX, y, pageW, HDR_H).fill(BLUE);
      let x = startX;
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 6, { width: colWidths[i] - 8, align: aligns[i] });
        x += colWidths[i];
      });
      doc.fillColor('#000000');
      y += HDR_H;
    };

    drawHeaders();

    prestamos.forEach((p, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape' });
        y = 50;
        drawHeaders();
      }

      const frecuencia = p.frecuencia_pago || 'mensual';
      // CORRECCIÓN: usar plazo_original para la cuota (evita el bug del 0)
      const plazoReal  = p.plazo_original || p.plazo || 0;
      const cuota      = calcularCuota(Number(p.monto), Number(p.interes), plazoReal, frecuencia);
      const saldo      = Number(p.saldo_actual ?? p.monto);

      // Fila rayada
      if (idx % 2 === 0) {
        doc.rect(startX, y, pageW, ROW_H).fill(STRIPE);
      }

      let x = startX;
      doc.fillColor('#000000').fontSize(9).font('Helvetica');

      const cells = [
        p.id.toString(),
        p.clientes?.nombre || 'N/A',                        // nombre completo sin truncar
        formatMoney(p.monto),
        `${Number(p.interes)}%`,
        plazoReal > 0 ? plazoReal.toString() : '—',         // CORRECCIÓN: muestra plazo real
        capFirst(frecuencia),
        plazoReal > 0 ? formatMoney(cuota) : '—',           // CORRECCIÓN: cuota con 2 decimales
        formatMoney(saldo),
        capFirst(p.estado || 'pendiente')
      ];

      // Color del estado
      const estadoColors = {
        activo:    '#16a34a',
        atrasado:  '#d97706',
        pagado:    '#3b82f6',
        castigado: '#dc2626',
        pendiente: '#64748b',
        cancelado: '#64748b',
        aprobado:  '#7c3aed'
      };

      cells.forEach((cell, i) => {
        const isEstado = i === 8;
        if (isEstado) {
          doc.fillColor(estadoColors[p.estado] || '#64748b');
        }
        doc.text(cell, x + 4, y + 5, { width: colWidths[i] - 8, align: aligns[i] });
        if (isEstado) doc.fillColor('#000000');
        x += colWidths[i];
      });

      // Línea separadora fina
      doc.moveTo(startX, y + ROW_H).lineTo(startX + pageW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.3).stroke().lineWidth(1);

      y += ROW_H;
    });

    // ── TOTALES ─────────────────────────────────────────────
    y += 8;
    doc.moveTo(startX, y).lineTo(startX + pageW, y).strokeColor('#1e3a5f').lineWidth(1).stroke();
    y += 8;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f');
    const totalMonto = prestamos.reduce((s, p) => s + Number(p.monto || 0), 0);
    const totalSaldo = prestamos.reduce((s, p) => s + Number(p.saldo_actual ?? p.monto ?? 0), 0);
    doc.text(`Total préstamos: ${prestamos.length}`, startX, y);
    doc.text(`Cartera total: RD$ ${formatMoney(totalMonto)}   |   Saldo pendiente: RD$ ${formatMoney(totalSaldo)}`,
      startX, y, { width: pageW, align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de préstamos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: PAGOS (PDF) — fuente más grande
// ============================================================
router.get('/pagos', async (req, res) => {
  try {
    const pagos = await prisma.pagos.findMany({
      where: { deleted_at: null },
      include: {
        prestamo: { include: { clientes: { select: { nombre: true } } } },
        usuario:  { select: { nombre: true } },
        cuota:    { select: { numero: true } }
      },
      orderBy: { fecha_pago: 'desc' }
    });

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-pagos.pdf');
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Reporte de Pagos', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(1.5);

    const pageW     = doc.page.width - 72;
    const startX    = 36;
    const colWidths = [40, 95, 160, 60, 55, 90, 130, 90];
    const headers   = ['ID', 'Fecha', 'Cliente', 'Préstamo', 'Cuota #', 'Monto', 'Método', 'Usuario'];
    const aligns    = ['center', 'center', 'left', 'center', 'center', 'right', 'center', 'center'];
    const ROW_H     = 20;
    const HDR_H     = 22;
    const BLUE      = '#1e3a5f';
    const STRIPE    = '#f1f5f9';

    let y = doc.y;

    const drawHeaders = () => {
      doc.rect(startX, y, pageW, HDR_H).fill(BLUE);
      let x = startX;
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 6, { width: colWidths[i] - 8, align: aligns[i] });
        x += colWidths[i];
      });
      doc.fillColor('#000000');
      y += HDR_H;
    };
    drawHeaders();

    pagos.forEach((p, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape' });
        y = 50;
        drawHeaders();
      }
      if (idx % 2 === 0) doc.rect(startX, y, pageW, ROW_H).fill(STRIPE);

      let x = startX;
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      const cells = [
        p.id.toString(),
        new Date(p.fecha_pago).toLocaleDateString('es-DO'),
        p.prestamo?.clientes?.nombre || 'N/A',
        `#${p.prestamo_id}`,
        p.cuota?.numero?.toString() || '—',
        `RD$ ${formatMoney(p.monto)}`,
        capFirst(p.metodo_pago || 'efectivo'),
        p.usuario?.nombre || '—'
      ];
      cells.forEach((cell, i) => {
        doc.text(cell, x + 4, y + 5, { width: colWidths[i] - 8, align: aligns[i] });
        x += colWidths[i];
      });
      doc.moveTo(startX, y + ROW_H).lineTo(startX + pageW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.3).stroke().lineWidth(1);
      y += ROW_H;
    });

    y += 8;
    doc.moveTo(startX, y).lineTo(startX + pageW, y).strokeColor(BLUE).lineWidth(1).stroke();
    y += 8;
    const totalPagos = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE);
    doc.text(`Total registros: ${pagos.length}`, startX, y);
    doc.text(`Total cobrado: RD$ ${formatMoney(totalPagos)}`, startX, y, { width: pageW, align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: CLIENTES (PDF) — fuente más grande, nombre completo
// ============================================================
router.get('/clientes', async (req, res) => {
  try {
    const clientes = await prisma.clientes.findMany({ orderBy: { nombre: 'asc' } });

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-clientes.pdf');
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Reporte de Clientes', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(1.5);

    const pageW     = doc.page.width - 72;
    const startX    = 36;
    const colWidths = [40, 185, 100, 115, 75];
    const headers   = ['ID', 'Nombre', 'Cédula', 'Teléfono', 'Estado'];
    const aligns    = ['center', 'left', 'center', 'center', 'center'];
    const ROW_H     = 20;
    const HDR_H     = 22;
    const BLUE      = '#1e3a5f';
    const STRIPE    = '#f1f5f9';

    let y = doc.y;

    const drawHeaders = () => {
      doc.rect(startX, y, pageW, HDR_H).fill(BLUE);
      let x = startX;
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 6, { width: colWidths[i] - 8, align: aligns[i] });
        x += colWidths[i];
      });
      doc.fillColor('#000000');
      y += HDR_H;
    };
    drawHeaders();

    clientes.forEach((c, idx) => {
      if (y > 750) { doc.addPage(); y = 50; drawHeaders(); }
      if (idx % 2 === 0) doc.rect(startX, y, pageW, ROW_H).fill(STRIPE);

      let x = startX;
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      const estadoColor = c.estado === 'activo' ? '#16a34a' : '#dc2626';
      const cells = [c.id.toString(), c.nombre || 'N/A', c.cedula || '—', c.telefono || '—', capFirst(c.estado || 'activo')];

      cells.forEach((cell, i) => {
        if (i === 4) doc.fillColor(estadoColor);
        doc.text(cell, x + 4, y + 5, { width: colWidths[i] - 8, align: aligns[i] });
        if (i === 4) doc.fillColor('#000000');
        x += colWidths[i];
      });
      doc.moveTo(startX, y + ROW_H).lineTo(startX + pageW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.3).stroke().lineWidth(1);
      y += ROW_H;
    });

    y += 8;
    doc.moveTo(startX, y).lineTo(startX + pageW, y).strokeColor(BLUE).lineWidth(1).stroke();
    y += 8;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE)
       .text(`Total clientes: ${clientes.length}`, startX, y);

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de clientes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: MOROSOS EXCEL — sin cambios
// ============================================================
router.get('/morosos-excel', async (req, res) => {
  try {
    const cuotasAtrasadas = await prisma.cuotas.findMany({
      where: {
        OR: [
          { estado: 'atrasado' },
          { estado: 'pendiente', fecha_vencimiento: { lt: new Date() } }
        ]
      },
      include: { prestamo: { include: { clientes: true } } },
      orderBy: { fecha_vencimiento: 'asc' }
    });

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Morosos');

    worksheet.columns = [
      { header: 'Cliente',           key: 'cliente',           width: 30 },
      { header: 'Cédula',            key: 'cedula',            width: 15 },
      { header: 'Teléfono',          key: 'telefono',          width: 15 },
      { header: 'Préstamo ID',       key: 'prestamo_id',       width: 12 },
      { header: 'Cuota #',           key: 'cuota_num',         width: 10 },
      { header: 'Monto Cuota',       key: 'monto',             width: 14 },
      { header: 'Pagado',            key: 'pagado',            width: 12 },
      { header: 'Pendiente',         key: 'pendiente',         width: 14 },
      { header: 'Días de Mora',      key: 'dias_mora',         width: 12 },
      { header: 'Saldo Préstamo',    key: 'saldo_prestamo',    width: 16 },
      { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 18 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    cuotasAtrasadas.forEach(c => {
      const diasMora   = Math.floor((new Date() - new Date(c.fecha_vencimiento)) / (1000 * 60 * 60 * 24));
      const montoCuota = Number(c.monto);
      const pagado     = Number(c.monto_pagado || 0);
      const pendiente  = Math.max(montoCuota - pagado, 0);

      worksheet.addRow({
        cliente:          c.prestamo?.clientes?.nombre || 'N/A',
        cedula:           c.prestamo?.clientes?.cedula || '—',
        telefono:         c.prestamo?.clientes?.telefono || '—',
        prestamo_id:      c.prestamo_id,
        cuota_num:        c.numero,
        monto:            montoCuota,
        pagado,
        pendiente,
        dias_mora:        Math.max(diasMora, 0),
        saldo_prestamo:   Number(c.prestamo?.saldo_actual ?? c.prestamo?.monto ?? 0),
        fecha_vencimiento: new Date(c.fecha_vencimiento).toLocaleDateString('es-DO')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=morosos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generando reporte de morosos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: CAJA PDF
// ============================================================
router.get('/caja/:id', async (req, res) => {
  try {
    const caja = await prisma.caja.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { movimientos_caja: { orderBy: { fecha: 'desc' } }, usuarios: true }
    });

    if (!caja) return res.status(404).json({ success: false, message: 'Caja no encontrada' });

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-caja-${caja.id}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('REPORTE DE CAJA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`ID Caja: ${caja.id}`, { align: 'center' });
    doc.text(`Apertura: ${new Date(caja.fecha_apertura).toLocaleString('es-DO')}`, { align: 'center' });
    if (caja.fecha_cierre) doc.text(`Cierre: ${new Date(caja.fecha_cierre).toLocaleString('es-DO')}`, { align: 'center' });
    doc.text(`Cajero: ${caja.usuarios?.nombre || 'N/A'}`, { align: 'center' });
    doc.moveDown(1.5);

    const ingresos = caja.movimientos_caja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
    const egresos  = caja.movimientos_caja.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
    const balance  = ingresos - egresos;

    doc.fontSize(13).font('Helvetica-Bold').text('RESUMEN', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Ingresos: RD$ ${formatMoney(ingresos)}`);
    doc.text(`Total Egresos:  RD$ ${formatMoney(egresos)}`);
    doc.text(`Balance Final:  RD$ ${formatMoney(balance)}`);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('DETALLE DE MOVIMIENTOS', { underline: true });
    doc.moveDown(0.5);

    const pageW     = doc.page.width - 72;
    const startX    = 36;
    const colWidths = [110, 220, 120];
    const headers   = ['Fecha', 'Concepto', 'Monto'];
    const ROW_H     = 20;
    let y = doc.y;

    const drawHeaders = () => {
      doc.rect(startX, y, pageW, 22).fill('#1e3a5f');
      let x = startX;
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 6, { width: colWidths[i] - 8, align: 'center' });
        x += colWidths[i];
      });
      doc.fillColor('#000');
      y += 22;
    };
    drawHeaders();

    caja.movimientos_caja.forEach((m, idx) => {
      if (y > 750) { doc.addPage(); y = 50; drawHeaders(); }
      if (idx % 2 === 0) doc.rect(startX, y, pageW, ROW_H).fill('#f1f5f9');

      let x = startX;
      const signo = m.tipo === 'ingreso' ? '+' : '-';
      const color = m.tipo === 'ingreso' ? '#16a34a' : '#dc2626';

      doc.fillColor('#000').fontSize(9).font('Helvetica')
         .text(new Date(m.fecha).toLocaleString('es-DO'), x + 4, y + 5, { width: colWidths[0] - 8, align: 'center' });
      x += colWidths[0];
      doc.text(m.descripcion || '—', x + 4, y + 5, { width: colWidths[1] - 8 });
      x += colWidths[1];
      doc.fillColor(color)
         .text(`${signo} RD$ ${formatMoney(m.monto)}`, x + 4, y + 5, { width: colWidths[2] - 8, align: 'right' })
         .fillColor('#000');
      doc.moveTo(startX, y + ROW_H).lineTo(startX + pageW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.3).stroke().lineWidth(1);
      y += ROW_H;
    });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de caja:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
