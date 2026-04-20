const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');
const PDFDocument = require('pdfkit');

router.use(authMiddleware);

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================
const formatDateTime = (date) => {
  return new Date(date).toLocaleString('es-DO', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

// ============================================================
// OBTENER BALANCE ACTUAL
// ============================================================
router.get('/balance', async (req, res) => {
  try {
    // Buscar caja abierta del día para el usuario actual
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaAbierta = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      },
      include: {
        movimientos_caja: {
          orderBy: { fecha: 'desc' }
        }
      }
    });

    if (!cajaAbierta) {
      return res.json({ 
        success: true, 
        data: { 
          abierta: false,
          balance: 0, 
          ingresos: 0, 
          egresos: 0,
          movimientos: [] 
        } 
      });
    }

    // Calcular ingresos y egresos
    const ingresos = cajaAbierta.movimientos_caja
      .filter(m => m.tipo === 'ingreso')
      .reduce((sum, m) => sum + Number(m.monto || 0), 0);
    
    const egresos = cajaAbierta.movimientos_caja
      .filter(m => m.tipo === 'egreso')
      .reduce((sum, m) => sum + Number(m.monto || 0), 0);
    
    const balance = ingresos - egresos;

    res.json({ 
      success: true, 
      data: {
        abierta: true,
        caja_id: cajaAbierta.id,
        fecha_apertura: cajaAbierta.fecha_apertura,
        balance: balance,
        ingresos: ingresos,
        egresos: egresos,
        movimientos: cajaAbierta.movimientos_caja.map(m => ({
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          descripcion: m.descripcion,
          fecha: m.fecha
        }))
      } 
    });
  } catch (error) {
    console.error('Error obteniendo balance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ABRIR CAJA
// ============================================================
router.post('/abrir', async (req, res) => {
  try {
    const { monto_inicial, notas } = req.body;

    // Verificar si ya hay una caja abierta
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaExistente = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      }
    });

    if (cajaExistente) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ya existe una caja abierta para hoy' 
      });
    }

    // Crear nueva caja
    const nuevaCaja = await prisma.caja.create({
      data: {
        usuario_id: req.user.id,
        fecha_apertura: new Date(),
        estado: 'abierta'
      }
    });

    // Registrar monto inicial si es mayor a 0
    if (monto_inicial && parseFloat(monto_inicial) > 0) {
      await prisma.movimientos_caja.create({
        data: {
          caja_id: nuevaCaja.id,
          tipo: 'ingreso',
          monto: parseFloat(monto_inicial),
          descripcion: notas || 'Apertura de caja - Monto inicial',
          fecha: new Date()
        }
      });
    }

    res.json({ 
      success: true, 
      message: 'Caja abierta exitosamente',
      data: {
        id: nuevaCaja.id,
        fecha_apertura: nuevaCaja.fecha_apertura
      }
    });
  } catch (error) {
    console.error('Error abriendo caja:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REGISTRAR INGRESO
// ============================================================
router.post('/ingreso', async (req, res) => {
  try {
    const { monto, descripcion } = req.body;

    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }

    // Buscar caja abierta del día
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaAbierta = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      }
    });

    if (!cajaAbierta) {
      return res.status(400).json({ 
        success: false, 
        message: 'No hay una caja abierta. Debes abrir la caja primero.' 
      });
    }

    const movimiento = await prisma.movimientos_caja.create({
      data: {
        caja_id: cajaAbierta.id,
        tipo: 'ingreso',
        monto: parseFloat(monto),
        descripcion: descripcion || 'Ingreso registrado',
        fecha: new Date()
      }
    });

    res.json({ 
      success: true, 
      message: 'Ingreso registrado exitosamente',
      data: {
        id: movimiento.id,
        tipo: 'ingreso',
        monto: Number(movimiento.monto),
        descripcion: movimiento.descripcion,
        fecha: movimiento.fecha
      }
    });
  } catch (error) {
    console.error('Error registrando ingreso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REGISTRAR EGRESO
// ============================================================
router.post('/egreso', async (req, res) => {
  try {
    const { monto, descripcion } = req.body;

    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }

    // Buscar caja abierta del día
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaAbierta = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      }
    });

    if (!cajaAbierta) {
      return res.status(400).json({ 
        success: false, 
        message: 'No hay una caja abierta. Debes abrir la caja primero.' 
      });
    }

    const movimiento = await prisma.movimientos_caja.create({
      data: {
        caja_id: cajaAbierta.id,
        tipo: 'egreso',
        monto: parseFloat(monto),
        descripcion: descripcion || 'Egreso registrado',
        fecha: new Date()
      }
    });

    res.json({ 
      success: true, 
      message: 'Egreso registrado exitosamente',
      data: {
        id: movimiento.id,
        tipo: 'egreso',
        monto: Number(movimiento.monto),
        descripcion: movimiento.descripcion,
        fecha: movimiento.fecha
      }
    });
  } catch (error) {
    console.error('Error registrando egreso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// CERRAR CAJA Y GENERAR REPORTE PDF
// ============================================================
router.post('/cerrar', async (req, res) => {
  try {
    const { balance_final, total_ingresos, total_egresos, movimientos } = req.body;

    // Buscar caja abierta
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaAbierta = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      },
      include: {
        movimientos_caja: true
      }
    });

    if (!cajaAbierta) {
      return res.status(400).json({ 
        success: false, 
        message: 'No hay una caja abierta para cerrar' 
      });
    }

    // Actualizar caja como cerrada
    await prisma.caja.update({
      where: { id: cajaAbierta.id },
      data: {
        estado: 'cerrada',
        fecha_cierre: new Date()
      }
    });

    // Generar PDF del reporte
    const doc = new PDFDocument({ margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cierre-caja-${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('REPORTE DE CIERRE DE CAJA', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.text(`Fecha de cierre: ${new Date().toLocaleString('es-DO')}`, { align: 'center' });
    doc.text(`Cajero: ${req.user.nombre || req.user.email}`, { align: 'center' });
    doc.moveDown(2);

    // Resumen
    doc.fontSize(12).font('Helvetica-Bold').text('RESUMEN DEL DÍA', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Ingresos: RD$ ${(total_ingresos || 0).toLocaleString('es-DO')}`);
    doc.text(`Total Egresos: RD$ ${(total_egresos || 0).toLocaleString('es-DO')}`);
    doc.text(`Balance Final: RD$ ${(balance_final || 0).toLocaleString('es-DO')}`);
    doc.moveDown();

    // Tabla de movimientos
    if (movimientos && movimientos.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').text('DETALLE DE MOVIMIENTOS', { underline: true });
      doc.moveDown(0.5);

      let y = doc.y;
      const startX = 50;
      const colWidths = [80, 200, 100];
      const headers = ['Hora', 'Concepto', 'Monto'];

      doc.fontSize(9).font('Helvetica-Bold');
      let x = startX;
      headers.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      y += 20;
      doc.fontSize(8).font('Helvetica');

      movimientos.forEach(m => {
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
        doc.text(m.hora || '—', x, y, { width: colWidths[0], align: 'center' });
        x += colWidths[0];
        doc.text(m.descripcion || '—', x, y, { width: colWidths[1], align: 'left' });
        x += colWidths[1];
        
        const signo = m.tipo === 'ingreso' ? '+' : '-';
        doc.fillColor(m.tipo === 'ingreso' ? '#16a34a' : '#dc2626')
          .text(`${signo} RD$ ${Number(m.monto).toLocaleString('es-DO')}`, x, y, { width: colWidths[2], align: 'right' })
          .fillColor('black');

        y += 18;
      });
    }

    doc.end();
  } catch (error) {
    console.error('Error cerrando caja:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// OBTENER MOVIMIENTOS DE LA CAJA ACTUAL
// ============================================================
router.get('/movimientos', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cajaAbierta = await prisma.caja.findFirst({
      where: {
        usuario_id: req.user.id,
        fecha_apertura: { gte: hoy },
        estado: 'abierta'
      },
      include: {
        movimientos_caja: {
          orderBy: { fecha: 'desc' }
        }
      }
    });

    if (!cajaAbierta) {
      return res.json({ success: true, data: [] });
    }

    res.json({ 
      success: true, 
      data: cajaAbierta.movimientos_caja.map(m => ({
        id: m.id,
        tipo: m.tipo,
        monto: Number(m.monto),
        descripcion: m.descripcion,
        fecha: m.fecha
      }))
    });
  } catch (error) {
    console.error('Error obteniendo movimientos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;