// src/services/contrato.service.js
// Genera el PDF del contrato de préstamo de Financiera Caribe Azul.
// Incluye: datos del préstamo, tabla de cuotas, cláusulas legales y espacio de firmas.

const PDFDocument = require('pdfkit');
const prisma      = require('../config/prisma');

// -------------------------------------------------------
// Helper: tasa por frecuencia
// -------------------------------------------------------
function tasaPorFrecuencia(interesAnual, frecuencia = 'mensual') {
  const anual = interesAnual / 100;
  switch (frecuencia) {
    case 'diaria':    return anual / 365;
    case 'semanal':   return anual / 52;
    case 'quincenal': return anual / 24;
    default:          return anual / 12;
  }
}

function calcularCuotaFrecuencia(monto, interesAnual, plazo, frecuencia = 'mensual') {
  if (!monto || !interesAnual || !plazo) return 0;
  const r = tasaPorFrecuencia(interesAnual, frecuencia);
  if (r === 0) return parseFloat((monto / plazo).toFixed(2));
  return parseFloat(
    (monto * (r * Math.pow(1 + r, plazo)) / (Math.pow(1 + r, plazo) - 1)).toFixed(2)
  );
}

function frecuenciaLabel(frecuencia) {
  const labels = {
    diaria:    'Diaria',
    semanal:   'Semanal',
    quincenal: 'Quincenal',
    mensual:   'Mensual'
  };
  return labels[frecuencia] || 'Mensual';
}

function formatMoney(n) {
  return `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-DO', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric'
  });
}

// -------------------------------------------------------
// Generar PDF — retorna Buffer
// -------------------------------------------------------
exports.generarContratoPDF = async (prestamoId) => {
  // ─── OBTENER DATOS ────────────────────────────────────
  const prestamo = await prisma.prestamos.findUnique({
    where: { id: parseInt(prestamoId) },
    include: {
      clientes:      true,
      cuotas:        { orderBy: { numero: 'asc' } },
      amortizacion:  { orderBy: { numero_cuota: 'asc' } }
    }
  });

  if (!prestamo) throw new Error('Préstamo no encontrado');
  if (!prestamo.clientes) throw new Error('Cliente no encontrado en el préstamo');

  const cliente     = prestamo.clientes;
  const frecuencia  = prestamo.frecuencia_pago || 'mensual';
  const montoN      = Number(prestamo.monto);
  const interesN    = Number(prestamo.interes);
  const plazoN      = prestamo.plazo;
  const cuotaValor  = calcularCuotaFrecuencia(montoN, interesN, plazoN, frecuencia);
  const totalPagar  = cuotaValor * plazoN;
  const totalInteres = totalPagar - montoN;
  const fechaInicio = prestamo.fecha_inicio ? new Date(prestamo.fecha_inicio) : new Date();

  // ─── CREAR DOCUMENTO ─────────────────────────────────
  const buffers = [];
  const doc = new PDFDocument({
    size:    'LETTER',
    margins: { top: 50, bottom: 50, left: 60, right: 60 }
  });

  doc.on('data', chunk => buffers.push(chunk));

  await new Promise((resolve, reject) => {
    doc.on('end',   resolve);
    doc.on('error', reject);

    const W    = doc.page.width  - 120; // ancho útil
    const BLUE = '#1e3a5f';
    const GRAY = '#555555';
    const LINE = '#cccccc';

    // ═══════════════════════════════════════════════════
    // ENCABEZADO
    // ═══════════════════════════════════════════════════
    doc
      .rect(0, 0, doc.page.width, 90)
      .fill(BLUE);

    doc
      .fillColor('#ffffff')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('FINANCIERA CARIBE AZUL', 60, 22, { width: W, align: 'center' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('CONTRATO DE PRÉSTAMO PERSONAL', 60, 48, { width: W, align: 'center' });

    doc
      .fontSize(8)
      .text(`No. de Contrato: #${String(prestamo.id).padStart(6, '0')}   |   Fecha: ${formatDate(new Date())}`, 60, 65, { width: W, align: 'center' });

    doc.fillColor('#000000').y = 110;
    doc.moveDown(0.5);

    // ═══════════════════════════════════════════════════
    // SECCIÓN: PARTES INVOLUCRADAS
    // ═══════════════════════════════════════════════════
    const sectionTitle = (title, y) => {
      doc
        .rect(60, y ?? doc.y, W, 18)
        .fill(BLUE);
      doc
        .fillColor('#ffffff')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(title, 68, (y ?? doc.y) + 4);
      doc.fillColor('#000000').moveDown(0.2);
    };

    const campo = (label, value, x, y, width = 240) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text(label + ':', x, y, { continued: false });
      doc.font('Helvetica').fontSize(9).fillColor('#000000').text(value || '—', x, y + 10, { width });
      doc.moveTo(x, y + 20).lineTo(x + width, y + 20).strokeColor(LINE).stroke();
    };

    // --- PRESTAMISTA ---
    sectionTitle('I. PRESTAMISTA');
    const yPrest = doc.y + 5;
    campo('Razón Social',  'FINANCIERA CARIBE AZUL S.R.L.',  60,  yPrest,       220);
    campo('RNC',           '1-30-12345-6',                    300, yPrest,       160);
    campo('Representante', 'Administrador General',           60,  yPrest + 35,  220);
    campo('Dirección',     'Santo Domingo, República Dominicana', 300, yPrest + 35, 240);
    doc.y = yPrest + 75;

    // --- PRESTATARIO ---
    doc.moveDown(0.5);
    sectionTitle('II. PRESTATARIO (CLIENTE)');
    const yCliente = doc.y + 5;
    campo('Nombre Completo',     cliente.nombre || '—',       60,  yCliente,       300);
    campo('Cédula de Identidad', cliente.cedula || '—',       380, yCliente,       160);
    campo('Teléfono',            cliente.telefono || '—',     60,  yCliente + 35,  160);
    campo('Email',               cliente.email || '—',        240, yCliente + 35,  180);
    campo('Dirección',           cliente.direccion || '—',    60,  yCliente + 70,  480);
    doc.y = yCliente + 110;

    // ═══════════════════════════════════════════════════
    // SECCIÓN: CONDICIONES DEL PRÉSTAMO
    // ═══════════════════════════════════════════════════
    doc.moveDown(0.5);
    sectionTitle('III. CONDICIONES DEL PRÉSTAMO');
    const yLoan = doc.y + 5;

    // Grid 3 columnas
    const col1 = 60, col2 = 240, col3 = 420;
    campo('Monto Prestado',      formatMoney(montoN),           col1, yLoan,      160);
    campo('Tasa de Interés',     `${interesN}% anual`,          col2, yLoan,      160);
    campo('Plazo',               `${plazoN} cuotas`,            col3, yLoan,      120);

    campo('Frecuencia de Pago',  frecuenciaLabel(frecuencia),   col1, yLoan + 40, 160);
    campo('Valor por Cuota',     formatMoney(cuotaValor),       col2, yLoan + 40, 160);
    campo('Fecha de Inicio',     formatDate(fechaInicio),       col3, yLoan + 40, 120);

    campo('Total de Intereses',  formatMoney(totalInteres),     col1, yLoan + 80, 160);
    campo('Total a Pagar',       formatMoney(totalPagar),       col2, yLoan + 80, 160);
    campo('Estado',              (prestamo.estado || 'pendiente').toUpperCase(), col3, yLoan + 80, 120);

    doc.y = yLoan + 125;

    // ═══════════════════════════════════════════════════
    // TABLA DE CUOTAS (max 20 para no extender demasiado)
    // ═══════════════════════════════════════════════════
    doc.moveDown(0.5);
    sectionTitle('IV. PLAN DE PAGOS (TABLA DE CUOTAS)');
    doc.moveDown(0.3);

    const tHeaders = ['Cuota #', 'Fecha Vencimiento', 'Capital', 'Interés', 'Monto Cuota', 'Saldo'];
    const tColW    = [50, 120, 85, 75, 95, 90];
    const tStartX  = 60;
    let tY         = doc.y;

    // Encabezado tabla
    const drawTableHeader = (y) => {
      doc.rect(tStartX, y, W, 16).fill('#e8f0fe');
      let tx = tStartX + 3;
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(7.5);
      tHeaders.forEach((h, i) => {
        doc.text(h, tx, y + 4, { width: tColW[i], align: i >= 2 ? 'right' : 'left' });
        tx += tColW[i];
      });
      doc.fillColor('#000000');
      return y + 18;
    };

    tY = drawTableHeader(tY);

    const cuotasParaMostrar = prestamo.cuotas.slice(0, 24); // max 24 filas en pag 1
    let saldo = montoN;

    cuotasParaMostrar.forEach((cuota, idx) => {
      // Nueva página si necesario
      if (tY > 680) {
        doc.addPage();
        tY = 50;
        tY = drawTableHeader(tY);
      }

      const amort = prestamo.amortizacion.find(a => a.numero_cuota === cuota.numero);
      const interesCuota = amort ? Number(amort.interes) : 0;
      const capitalCuota = amort ? Number(amort.capital) : cuotaValor;
      if (amort) saldo = Number(amort.saldo_restante);

      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(tStartX, tY, W, 14).fill(bgColor);

      let tx = tStartX + 3;
      doc.fillColor('#000000').font('Helvetica').fontSize(7.5);
      doc.text(String(cuota.numero),                    tx, tY + 3, { width: tColW[0] });               tx += tColW[0];
      doc.text(formatDate(cuota.fecha_vencimiento),     tx, tY + 3, { width: tColW[1] });               tx += tColW[1];
      doc.text(formatMoney(capitalCuota),               tx, tY + 3, { width: tColW[2], align: 'right' }); tx += tColW[2];
      doc.text(formatMoney(interesCuota),               tx, tY + 3, { width: tColW[3], align: 'right' }); tx += tColW[3];
      doc.text(formatMoney(cuotaValor),                 tx, tY + 3, { width: tColW[4], align: 'right' }); tx += tColW[4];
      doc.text(formatMoney(Math.max(saldo, 0)),         tx, tY + 3, { width: tColW[5], align: 'right' });

      // Línea separadora
      doc.moveTo(tStartX, tY + 14).lineTo(tStartX + W, tY + 14).strokeColor('#e0e0e0').lineWidth(0.3).stroke();
      doc.lineWidth(1);
      tY += 14;
    });

    if (prestamo.cuotas.length > 24) {
      doc.y = tY + 4;
      doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
        .text(`* Se muestran las primeras 24 cuotas de ${prestamo.cuotas.length} en total.`, tStartX, tY + 4);
      doc.y = tY + 20;
    } else {
      doc.y = tY + 8;
    }

    // ═══════════════════════════════════════════════════
    // CLÁUSULAS LEGALES — nueva página
    // ═══════════════════════════════════════════════════
    doc.addPage();

    sectionTitle('V. CLÁUSULAS Y CONDICIONES');
    doc.moveDown(0.4);

    const clausula = (num, titulo, texto) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLUE).text(`${num}. ${titulo}`, { paragraphGap: 2 });
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(texto, { align: 'justify', paragraphGap: 6, lineGap: 2 });
      doc.moveDown(0.3);
    };

    clausula('PRIMERA', 'OBLIGACIÓN DE PAGO',
      `El PRESTATARIO, ${cliente.nombre?.toUpperCase()}, portador de la cédula de identidad y electoral No. ${cliente.cedula || '—'}, ` +
      `se compromete a pagar a FINANCIERA CARIBE AZUL S.R.L. la suma de ${formatMoney(montoN)}, ` +
      `más los intereses pactados a una tasa del ${interesN}% anual, mediante ${plazoN} cuotas de pago ` +
      `${frecuenciaLabel(frecuencia).toLowerCase()}s de ${formatMoney(cuotaValor)} cada una, ` +
      `según el plan de pagos establecido en la Cláusula IV del presente contrato.`
    );

    clausula('SEGUNDA', 'MORA Y RECARGOS',
      `En caso de incumplimiento en el pago de cualquiera de las cuotas en la fecha estipulada, ` +
      `el PRESTATARIO incurrirá automáticamente en mora, generando un recargo del 5% sobre el monto de la cuota ` +
      `impagada por cada período de atraso, sin necesidad de notificación previa. ` +
      `La acumulación de dos (2) o más cuotas vencidas dará derecho a FINANCIERA CARIBE AZUL S.R.L. ` +
      `a declarar vencida la totalidad de la deuda y exigir el pago inmediato del saldo pendiente.`
    );

    clausula('TERCERA', 'GARANTÍA',
      `En garantía del fiel cumplimiento de las obligaciones asumidas en este contrato, el PRESTATARIO ` +
      `compromete como garantía cualquier bien inmueble, propiedad o vehículo de su propiedad. ` +
      `El PRESTATARIO declara bajo juramento que los bienes ofrecidos en garantía se encuentran libres ` +
      `de gravámenes, hipotecas, embargos o cualquier otra carga que pudiera afectar su valor. ` +
      `En caso de incumplimiento reiterado, FINANCIERA CARIBE AZUL S.R.L. podrá iniciar las acciones ` +
      `legales correspondientes para la recuperación del monto adeudado, incluyendo la ejecución de garantías.`
    );

    clausula('CUARTA', 'PREPAGO',
      `El PRESTATARIO tiene derecho a cancelar anticipadamente el préstamo, total o parcialmente, ` +
      `en cualquier momento durante la vigencia del contrato. En caso de pago anticipado total, ` +
      `se recalculará el interés correspondiente al período efectivamente utilizado, ` +
      `sin penalización adicional. Los pagos parciales se aplicarán primero a moras pendientes, ` +
      `luego a intereses y finalmente al capital adeudado.`
    );

    clausula('QUINTA', 'VERACIDAD DE LA INFORMACIÓN',
      `El PRESTATARIO declara que toda la información suministrada para la obtención de este préstamo ` +
      `es verídica y comprobable. Cualquier falsedad en la información proporcionada constituye causa ` +
      `suficiente para la declaración inmediata del vencimiento de la deuda y la interposición de ` +
      `las acciones penales correspondientes conforme a la legislación dominicana vigente.`
    );

    clausula('SEXTA', 'DOMICILIO Y JURISDICCIÓN',
      `Para todos los efectos legales derivados del presente contrato, las partes fijan como domicilio ` +
      `especial la ciudad de Santo Domingo, República Dominicana, sometiéndose expresamente a la ` +
      `jurisdicción de los Tribunales de la República Dominicana y a la Ley No. 183-02 ` +
      `(Ley Monetaria y Financiera) y demás disposiciones legales aplicables.`
    );

    clausula('SÉPTIMA', 'PROTECCIÓN DE DATOS',
      `El PRESTATARIO autoriza expresamente a FINANCIERA CARIBE AZUL S.R.L. a utilizar sus datos ` +
      `personales para los fines exclusivos de gestión del presente contrato, incluyendo su registro ` +
      `en bureaus de crédito y organismos reguladores conforme a la legislación vigente sobre ` +
      `protección de datos personales en la República Dominicana.`
    );

    // ═══════════════════════════════════════════════════
    // DECLARACIÓN DE ACEPTACIÓN
    // ═══════════════════════════════════════════════════
    doc.moveDown(0.5);

    const yDecl = doc.y;
    doc.rect(60, yDecl, W, 55).fillAndStroke('#f0f4ff', '#c0c8e0');
    doc.y = yDecl + 6;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE)
      .text('DECLARACIÓN DE ACEPTACIÓN', 68, yDecl + 6, { width: W - 16, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor('#000000')
      .text(
        `Yo, ${(cliente.nombre || '').toUpperCase()}, portador(a) de la Cédula de Identidad y Electoral ` +
        `No. ${cliente.cedula || '—'}, declaro haber leído, entendido y aceptado en su totalidad los ` +
        `términos y condiciones establecidos en el presente contrato de préstamo, comprometiéndome al ` +
        `cumplimiento de todas y cada una de las obligaciones aquí contenidas.`,
        68, yDecl + 20, { width: W - 16, align: 'justify', lineGap: 1 }
      );

    doc.fillColor('#000000');
    doc.y = yDecl + 65;

    // ═══════════════════════════════════════════════════
    // FIRMAS
    // ═══════════════════════════════════════════════════
    doc.moveDown(1.2);

    const yFirmas = doc.y;
    const firmaW  = 200;
    const xFirma1 = 60;
    const xFirma2 = doc.page.width - 60 - firmaW;

    // Línea firma cliente
    doc.moveTo(xFirma1, yFirmas + 40).lineTo(xFirma1 + firmaW, yFirmas + 40).strokeColor('#000').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000')
      .text('FIRMA DEL PRESTATARIO', xFirma1, yFirmas + 43, { width: firmaW, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(cliente.nombre || '—', xFirma1, yFirmas + 54, { width: firmaW, align: 'center' });
    doc.text(`Cédula: ${cliente.cedula || '—'}`, xFirma1, yFirmas + 64, { width: firmaW, align: 'center' });

    // Línea firma financiera
    doc.moveTo(xFirma2, yFirmas + 40).lineTo(xFirma2 + firmaW, yFirmas + 40).strokeColor('#000').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000')
      .text('FIRMA DEL REPRESENTANTE', xFirma2, yFirmas + 43, { width: firmaW, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text('FINANCIERA CARIBE AZUL S.R.L.', xFirma2, yFirmas + 54, { width: firmaW, align: 'center' });
    doc.text('Sello / Firma Autorizada', xFirma2, yFirmas + 64, { width: firmaW, align: 'center' });

    // ═══════════════════════════════════════════════════
    // PIE DE PÁGINA
    // ═══════════════════════════════════════════════════
    doc.y = yFirmas + 90;
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(7).fillColor(GRAY).text(
      `Contrato No. #${String(prestamo.id).padStart(6, '0')} — Generado el ${formatDate(new Date())} — Financiera Caribe Azul S.R.L. — Santo Domingo, RD`,
      60, doc.y, { width: W, align: 'center' }
    );

    doc.end();
  });

  return Buffer.concat(buffers);
};