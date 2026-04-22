const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.use(authMiddleware);

// Función para calcular cuota mensual
function calcularCuota(monto, interesAnual, plazoMeses) {
  if (!monto || !interesAnual || !plazoMeses || monto <= 0 || interesAnual <= 0 || plazoMeses <= 0) {
    return 0;
  }
  const tasaMensual = interesAnual / 100 / 12;
  const cuota = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
  return Math.round(cuota * 100) / 100;
}

// ============================================================
// REPORTE: PRÉSTAMOS (PDF)
// ============================================================
router.get('/prestamos', async (req, res) => {
  try {
    const prestamos = await prisma.prestamos.findMany({
      include: {
        clientes: {
          select: { nombre: true, cedula: true, telefono: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-prestamos.pdf');
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Préstamos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(2);

    // Tabla
    const startX = 50;
    let y = doc.y;

    // Columnas
    const colWidths = [40, 100, 80, 80, 80, 80, 80];
    const headers = ['ID', 'Cliente', 'Monto (RD$)', 'Interés', 'Plazo', 'Cuota', 'Estado'];

    // Dibujar encabezados
    doc.fontSize(9).font('Helvetica-Bold');
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    y += 20;
    doc.fontSize(8).font('Helvetica');

    prestamos.forEach(p => {
      if (y > 750) {
        doc.addPage();
        y = 50;
        // Redibujar encabezados en nueva página
        x = startX;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          doc.text(h, x, y, { width: colWidths[i], align: 'center' });
          x += colWidths[i];
        });
        y += 20;
        doc.fontSize(8).font('Helvetica');
      }

      x = startX;
      doc.text(p.id.toString(), x, y, { width: colWidths[0], align: 'center' });
      x += colWidths[0];
      doc.text(p.clientes?.nombre?.substring(0, 20) || 'N/A', x, y, { width: colWidths[1], align: 'center' });
      x += colWidths[1];
      doc.text(Number(p.monto).toLocaleString('es-DO'), x, y, { width: colWidths[2], align: 'right' });
      x += colWidths[2];
      doc.text(`${Number(p.interes)}%`, x, y, { width: colWidths[3], align: 'center' });
      x += colWidths[3];
      doc.text(`${p.plazo} meses`, x, y, { width: colWidths[4], align: 'center' });
      x += colWidths[4];
      doc.text(calcularCuota(Number(p.monto), Number(p.interes), p.plazo).toLocaleString('es-DO'), x, y, { width: colWidths[5], align: 'right' });
      x += colWidths[5];
      doc.text(p.estado || '—', x, y, { width: colWidths[6], align: 'center' });

      y += 18;
    });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de préstamos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: PAGOS (PDF)
// ============================================================
router.get('/pagos', async (req, res) => {
  try {
    const pagos = await prisma.pagos.findMany({
      include: {
        prestamo: {
          include: { clientes: { select: { nombre: true } } }
        },
        usuario: { select: { nombre: true } },
        cuota: { select: { numero: true } }
      },
      orderBy: { fecha_pago: 'desc' }
    });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-pagos.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Pagos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(2);

    const colWidths = [40, 90, 90, 80, 80, 80, 80];
    const headers = ['ID', 'Fecha', 'Cliente', 'Préstamo', 'Cuota', 'Monto', 'Usuario'];

    let y = doc.y;
    let x = 50;

    doc.fontSize(9).font('Helvetica-Bold');
    x = 50;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    y += 20;
    doc.fontSize(8).font('Helvetica');

    pagos.forEach(p => {
      if (y > 750) {
        doc.addPage();
        y = 50;
        x = 50;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          doc.text(h, x, y, { width: colWidths[i], align: 'center' });
          x += colWidths[i];
        });
        y += 20;
        doc.fontSize(8).font('Helvetica');
      }

      x = 50;
      doc.text(p.id.toString(), x, y, { width: colWidths[0], align: 'center' });
      x += colWidths[0];
      doc.text(new Date(p.fecha_pago).toLocaleDateString('es-DO'), x, y, { width: colWidths[1], align: 'center' });
      x += colWidths[1];
      doc.text(p.prestamo?.clientes?.nombre?.substring(0, 20) || 'N/A', x, y, { width: colWidths[2], align: 'center' });
      x += colWidths[2];
      doc.text(`#${p.prestamo_id}`, x, y, { width: colWidths[3], align: 'center' });
      x += colWidths[3];
      doc.text(p.cuota?.numero?.toString() || '—', x, y, { width: colWidths[4], align: 'center' });
      x += colWidths[4];
      doc.text(Number(p.monto).toLocaleString('es-DO'), x, y, { width: colWidths[5], align: 'right' });
      x += colWidths[5];
      doc.text(p.usuario?.nombre || '—', x, y, { width: colWidths[6], align: 'center' });

      y += 18;
    });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de pagos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: CLIENTES (PDF)
// ============================================================
router.get('/clientes', async (req, res) => {
  try {
    const clientes = await prisma.clientes.findMany({
      orderBy: { nombre: 'asc' }
    });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-clientes.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Clientes', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.moveDown(2);

    const colWidths = [40, 120, 80, 100, 100];
    const headers = ['ID', 'Nombre', 'Cédula', 'Teléfono', 'Estado'];

    let y = doc.y;
    let x = 50;

    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    y += 20;
    doc.fontSize(8).font('Helvetica');

    clientes.forEach(c => {
      if (y > 750) {
        doc.addPage();
        y = 50;
        x = 50;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          doc.text(h, x, y, { width: colWidths[i], align: 'center' });
          x += colWidths[i];
        });
        y += 20;
        doc.fontSize(8).font('Helvetica');
      }

      x = 50;
      doc.text(c.id.toString(), x, y, { width: colWidths[0], align: 'center' });
      x += colWidths[0];
      doc.text(c.nombre?.substring(0, 25) || 'N/A', x, y, { width: colWidths[1], align: 'left' });
      x += colWidths[1];
      doc.text(c.cedula || '—', x, y, { width: colWidths[2], align: 'center' });
      x += colWidths[2];
      doc.text(c.telefono || '—', x, y, { width: colWidths[3], align: 'center' });
      x += colWidths[3];
      doc.text(c.estado || 'activo', x, y, { width: colWidths[4], align: 'center' });

      y += 18;
    });

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de clientes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REPORTE: MOROSOS EXCEL
// ============================================================
router.get('/morosos-excel', async (req, res) => {
  try {
    // Obtener cuotas atrasadas con información de clientes
    const cuotasAtrasadas = await prisma.cuotas.findMany({
      where: {
        estado: 'pendiente',
        fecha_vencimiento: { lt: new Date() }
      },
      include: {
        prestamo: {
          include: {
            clientes: true
          }
        }
      },
      orderBy: { fecha_vencimiento: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Morosos');

    // Columnas
    worksheet.columns = [
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Cédula', key: 'cedula', width: 15 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Préstamo ID', key: 'prestamo_id', width: 12 },
      { header: 'Cuota #', key: 'cuota_num', width: 10 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Días de Mora', key: 'dias_mora', width: 12 },
      { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 15 }
    ];

    // Estilo header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };

    cuotasAtrasadas.forEach(c => {
      const diasMora = Math.floor((new Date() - new Date(c.fecha_vencimiento)) / (1000 * 60 * 60 * 24));
      worksheet.addRow({
        cliente: c.prestamo?.clientes?.nombre || 'N/A',
        cedula: c.prestamo?.clientes?.cedula || '—',
        telefono: c.prestamo?.clientes?.telefono || '—',
        prestamo_id: c.prestamo_id,
        cuota_num: c.numero,
        monto: Number(c.monto).toLocaleString('es-DO'),
        dias_mora: diasMora,
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
// REPORTE: CAJA PDF (usando el servicio)
// ============================================================
router.get('/caja/:id', async (req, res) => {
  try {
    const caja = await prisma.caja.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        movimientos_caja: {
          orderBy: { fecha: 'desc' }
        },
        usuarios: true
      }
    });

    if (!caja) {
      return res.status(404).json({ success: false, message: 'Caja no encontrada' });
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-caja-${caja.id}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('REPORTE DE CAJA', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.text(`ID Caja: ${caja.id}`, { align: 'center' });
    doc.text(`Fecha apertura: ${new Date(caja.fecha_apertura).toLocaleString('es-DO')}`, { align: 'center' });
    if (caja.fecha_cierre) {
      doc.text(`Fecha cierre: ${new Date(caja.fecha_cierre).toLocaleString('es-DO')}`, { align: 'center' });
    }
    doc.text(`Cajero: ${caja.usuarios?.nombre || 'N/A'}`, { align: 'center' });
    doc.moveDown(2);

    // Resumen
    const ingresos = caja.movimientos_caja.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + Number(m.monto), 0);
    const egresos = caja.movimientos_caja.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + Number(m.monto), 0);
    const balance = ingresos - egresos;

    doc.fontSize(12).font('Helvetica-Bold').text('RESUMEN', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Ingresos: RD$ ${ingresos.toLocaleString('es-DO')}`);
    doc.text(`Total Egresos: RD$ ${egresos.toLocaleString('es-DO')}`);
    doc.text(`Balance Final: RD$ ${balance.toLocaleString('es-DO')}`);
    doc.moveDown();

    // Tabla de movimientos
    doc.fontSize(10).font('Helvetica-Bold').text('DETALLE DE MOVIMIENTOS', { underline: true });
    doc.moveDown(0.5);

    let y = doc.y;
    const startX = 50;
    const colWidths = [100, 200, 100];
    const headers = ['Fecha', 'Concepto', 'Monto'];

    doc.fontSize(9).font('Helvetica-Bold');
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    y += 20;
    doc.fontSize(8).font('Helvetica');

    for (const m of caja.movimientos_caja) {
      if (y > 750) {
        doc.addPage();
        y = 50;
        x = startX;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          doc.text(h, x, y, { width: colWidths[i], align: 'center' });
          x += colWidths[i];
        });
        y += 20;
        doc.fontSize(8).font('Helvetica');
      }

      x = startX;
      doc.text(new Date(m.fecha).toLocaleString('es-DO'), x, y, { width: colWidths[0], align: 'center' });
      x += colWidths[0];
      doc.text(m.descripcion || '—', x, y, { width: colWidths[1], align: 'left' });
      x += colWidths[1];
      
      const signo = m.tipo === 'ingreso' ? '+' : '-';
      doc.fillColor(m.tipo === 'ingreso' ? '#16a34a' : '#dc2626')
        .text(`${signo} RD$ ${Number(m.monto).toLocaleString('es-DO')}`, x, y, { width: colWidths[2], align: 'right' })
        .fillColor('black');

      y += 18;
    }

    doc.end();
  } catch (error) {
    console.error('Error generando reporte de caja:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;