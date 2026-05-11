// src/routes/caja.routes.js
// CORRECCIONES:
// 1. La caja es COMPARTIDA por día (no por usuario_id).
//    Antes: cada usuario abría su propia caja → Admin y Cajero veían registros distintos.
//    Ahora: existe UNA sola caja abierta por día; todos los roles operan sobre ella.
// 2. Se agrega el endpoint GET /caja/stream (SSE) para notificar en tiempo real
//    a todos los clientes conectados cuando hay un movimiento, apertura o cierre.
// 3. El endpoint GET /balance ahora devuelve la caja del día sin filtrar por usuario_id.
// 4. Los endpoints /ingreso, /egreso y /cerrar también buscan la caja del día (no la del usuario).

const router  = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma   = require('../config/prisma');
const PDFDocument = require('pdfkit');

router.use(authMiddleware);

// ──────────────────────────────────────────────────────────
// SSE — clientes conectados (en memoria, sin Redis)
// ──────────────────────────────────────────────────────────
const clientes = new Set();

function broadcast(evento, data) {
  const payload = `data: ${JSON.stringify({ evento, data })}\n\n`;
  for (const res of clientes) {
    try { res.write(payload); } catch (_) { clientes.delete(res); }
  }
}

// GET /caja/stream — escuchar eventos en tiempo real
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: desactivar buffering
  res.flushHeaders();

  // Ping cada 25 s para mantener viva la conexión
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* conexión cerrada */ }
  }, 25_000);

  clientes.add(res);

  req.on('close', () => {
    clearInterval(ping);
    clientes.delete(res);
  });
});

// ──────────────────────────────────────────────────────────
// Helper: caja del día (compartida — sin filtro de usuario)
// ──────────────────────────────────────────────────────────
async function getCajaDelDia(includeMovimientos = false) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return prisma.caja.findFirst({
    where: {
      fecha_apertura: { gte: hoy },
      estado: 'abierta'
    },
    ...(includeMovimientos && {
      include: {
        movimientos_caja: { orderBy: { fecha: 'desc' } }
      }
    })
  });
}

// ──────────────────────────────────────────────────────────
// GET /caja/balance
// ──────────────────────────────────────────────────────────
router.get('/balance', async (req, res) => {
  try {
    const caja = await getCajaDelDia(true);

    if (!caja) {
      return res.json({
        success: true,
        data: { abierta: false, balance: 0, ingresos: 0, egresos: 0, movimientos: [] }
      });
    }

    const ingresos = caja.movimientos_caja
      .filter(m => m.tipo === 'ingreso')
      .reduce((s, m) => s + Number(m.monto || 0), 0);

    const egresos = caja.movimientos_caja
      .filter(m => m.tipo === 'egreso')
      .reduce((s, m) => s + Number(m.monto || 0), 0);

    res.json({
      success: true,
      data: {
        abierta:        true,
        caja_id:        caja.id,
        fecha_apertura: caja.fecha_apertura,
        balance:        ingresos - egresos,
        ingresos,
        egresos,
        movimientos: caja.movimientos_caja.map(m => ({
          id:          m.id,
          tipo:        m.tipo,
          monto:       Number(m.monto),
          descripcion: m.descripcion,
          fecha:       m.fecha
        }))
      }
    });
  } catch (err) {
    console.error('Error en /balance:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// POST /caja/abrir
// Solo Admin / Cajero pueden abrir caja (el authMiddleware ya valida el rol).
// Se permite UNA sola caja abierta por día.
// ──────────────────────────────────────────────────────────
router.post('/abrir', async (req, res) => {
  try {
    const cajaExistente = await getCajaDelDia();
    if (cajaExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una caja abierta hoy. Solo puede haber una caja activa por día.'
      });
    }

    const { monto_inicial, notas } = req.body;

    const nuevaCaja = await prisma.caja.create({
      data: {
        usuario_id:     req.user.id,   // quién la abrió (auditoría)
        fecha_apertura: new Date(),
        estado:         'abierta'
      }
    });

    if (monto_inicial && parseFloat(monto_inicial) > 0) {
      await prisma.movimientos_caja.create({
        data: {
          caja_id:     nuevaCaja.id,
          tipo:        'ingreso',
          monto:       parseFloat(monto_inicial),
          descripcion: notas || 'Apertura de caja – Monto inicial',
          fecha:       new Date()
        }
      });
    }

    // Notificar a todos los clientes SSE
    broadcast('CAJA_ABIERTA', {
      caja_id:        nuevaCaja.id,
      fecha_apertura: nuevaCaja.fecha_apertura,
      abierta_por:    req.user.nombre || req.user.email
    });

    res.json({
      success: true,
      message: 'Caja abierta exitosamente',
      data: { id: nuevaCaja.id, fecha_apertura: nuevaCaja.fecha_apertura }
    });
  } catch (err) {
    console.error('Error abriendo caja:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// POST /caja/ingreso
// ──────────────────────────────────────────────────────────
router.post('/ingreso', async (req, res) => {
  try {
    const { monto, descripcion } = req.body;
    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }

    const caja = await getCajaDelDia();
    if (!caja) {
      return res.status(400).json({ success: false, message: 'No hay caja abierta. Abre la caja primero.' });
    }

    const movimiento = await prisma.movimientos_caja.create({
      data: {
        caja_id:     caja.id,
        tipo:        'ingreso',
        monto:       parseFloat(monto),
        descripcion: descripcion || 'Ingreso manual',
        fecha:       new Date()
      }
    });

    // Recalcular balance para el broadcast
    const balance = await calcularBalance(caja.id);

    broadcast('NUEVO_MOVIMIENTO', {
      id:           movimiento.id,
      tipo:         'ingreso',
      monto:        Number(movimiento.monto),
      descripcion:  movimiento.descripcion,
      fecha:        movimiento.fecha,
      balance_nuevo: balance.total,
      ingresos:     balance.ingresos,
      egresos:      balance.egresos,
      registrado_por: req.user.nombre || req.user.email
    });

    res.json({
      success: true,
      message: 'Ingreso registrado',
      data: {
        id:          movimiento.id,
        tipo:        'ingreso',
        monto:       Number(movimiento.monto),
        descripcion: movimiento.descripcion,
        fecha:       movimiento.fecha,
        balance_actual: balance.total
      }
    });
  } catch (err) {
    console.error('Error en /ingreso:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// POST /caja/egreso
// ──────────────────────────────────────────────────────────
router.post('/egreso', async (req, res) => {
  try {
    const { monto, descripcion } = req.body;
    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }

    const caja = await getCajaDelDia();
    if (!caja) {
      return res.status(400).json({ success: false, message: 'No hay caja abierta. Abre la caja primero.' });
    }

    const movimiento = await prisma.movimientos_caja.create({
      data: {
        caja_id:     caja.id,
        tipo:        'egreso',
        monto:       parseFloat(monto),
        descripcion: descripcion || 'Egreso manual',
        fecha:       new Date()
      }
    });

    const balance = await calcularBalance(caja.id);

    broadcast('NUEVO_MOVIMIENTO', {
      id:           movimiento.id,
      tipo:         'egreso',
      monto:        Number(movimiento.monto),
      descripcion:  movimiento.descripcion,
      fecha:        movimiento.fecha,
      balance_nuevo: balance.total,
      ingresos:     balance.ingresos,
      egresos:      balance.egresos,
      registrado_por: req.user.nombre || req.user.email
    });

    res.json({
      success: true,
      message: 'Egreso registrado',
      data: {
        id:          movimiento.id,
        tipo:        'egreso',
        monto:       Number(movimiento.monto),
        descripcion: movimiento.descripcion,
        fecha:       movimiento.fecha,
        balance_actual: balance.total
      }
    });
  } catch (err) {
    console.error('Error en /egreso:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// POST /caja/cerrar — cierra la caja del día y genera PDF
// ──────────────────────────────────────────────────────────
router.post('/cerrar', async (req, res) => {
  try {
    const caja = await getCajaDelDia(true);
    if (!caja) {
      return res.status(400).json({ success: false, message: 'No hay caja abierta para cerrar.' });
    }

    // Calcular desde BD (no confiar en el payload del cliente)
    const balance = await calcularBalance(caja.id);

    await prisma.caja.update({
      where: { id: caja.id },
      data:  { estado: 'cerrada', fecha_cierre: new Date() }
    });

    // Notificar cierre a todos antes de cerrar la conexión con el PDF
    broadcast('CAJA_CERRADA', {
      caja_id:       caja.id,
      balance_final: balance.total,
      cerrada_por:   req.user.nombre || req.user.email
    });

    // Generar PDF del reporte
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=cierre-caja-${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);

    // ── Encabezado ──
    doc.fontSize(20).font('Helvetica-Bold')
      .text('REPORTE DE CIERRE DE CAJA', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Fecha: ${new Date().toLocaleString('es-DO')}`, { align: 'center' })
      .text(`Cerrado por: ${req.user.nombre || req.user.email}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Resumen ──
    doc.fontSize(13).font('Helvetica-Bold').text('RESUMEN', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica')
      .text(`Total Ingresos : RD$ ${balance.ingresos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`)
      .text(`Total Egresos  : RD$ ${balance.egresos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`)
      .text(`Balance Final  : RD$ ${balance.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
    doc.moveDown(1.5);

    // ── Movimientos ──
    const movs = caja.movimientos_caja;
    if (movs.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('DETALLE DE MOVIMIENTOS', { underline: true });
      doc.moveDown(0.6);

      const colX   = [40, 110, 240, 430];
      const colW   = [60, 120, 180, 110];
      const headers = ['Hora', 'Tipo', 'Concepto', 'Monto'];

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: colW[i], align: i === 3 ? 'right' : 'left' }));

      let y = doc.y + 14;
      doc.fontSize(8).font('Helvetica');

      for (const m of movs) {
        if (y > 750) { doc.addPage(); y = 40; }
        const hora  = new Date(m.fecha).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
        const signo = m.tipo === 'ingreso' ? '+' : '-';
        const color = m.tipo === 'ingreso' ? '#16a34a' : '#dc2626';

        doc.fillColor('#000').text(hora,             colX[0], y, { width: colW[0] });
        doc.fillColor('#000').text(m.tipo,            colX[1], y, { width: colW[1] });
        doc.fillColor('#000').text(m.descripcion||'—', colX[2], y, { width: colW[2] });
        doc.fillColor(color).text(
          `${signo} RD$ ${Number(m.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
          colX[3], y, { width: colW[3], align: 'right' }
        );
        y += 16;
      }
    }

    doc.end();
  } catch (err) {
    console.error('Error cerrando caja:', err);
    // Si ya enviamos headers (stream PDF) no podemos cambiar a JSON
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
});

// ──────────────────────────────────────────────────────────
// GET /caja/movimientos
// ──────────────────────────────────────────────────────────
router.get('/movimientos', async (req, res) => {
  try {
    const caja = await getCajaDelDia(true);
    if (!caja) return res.json({ success: true, data: [] });

    res.json({
      success: true,
      data: caja.movimientos_caja.map(m => ({
        id:          m.id,
        tipo:        m.tipo,
        monto:       Number(m.monto),
        descripcion: m.descripcion,
        fecha:       m.fecha
      }))
    });
  } catch (err) {
    console.error('Error en /movimientos:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// Helper privado: calcular balance de una caja por ID
// ──────────────────────────────────────────────────────────
async function calcularBalance(cajaId) {
  const [ing, egr] = await Promise.all([
    prisma.movimientos_caja.aggregate({
      where: { caja_id: cajaId, tipo: 'ingreso' },
      _sum: { monto: true }
    }),
    prisma.movimientos_caja.aggregate({
      where: { caja_id: cajaId, tipo: 'egreso' },
      _sum: { monto: true }
    })
  ]);
  const ingresos = Number(ing._sum.monto || 0);
  const egresos  = Number(egr._sum.monto || 0);
  return { ingresos, egresos, total: ingresos - egresos };
}

module.exports = router;
