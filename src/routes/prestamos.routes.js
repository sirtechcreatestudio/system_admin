const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(authMiddleware);

// ============================================================
// FUNCIONES DE CÁLCULO POR FRECUENCIA (con interés MENSUAL)
// ============================================================

/**
 * Convierte el plazo a meses equivalentes para guardar en BD
 */
function plazoEnMeses(plazo, frecuencia) {
  switch (frecuencia) {
    case 'diario': return plazo / 30;
    case 'semanal': return plazo / 4;
    case 'quincenal': return plazo / 2;
    default: return plazo; // mensual
  }
}

/**
 * Calcula la tasa de interés por período según la frecuencia
 * PARTIENDO de una tasa MENSUAL
 */
function tasaPorPeriodo(interesMensual, frecuencia) {
  const tasaMensual = interesMensual / 100; // Ej: 5% mensual = 0.05
  
  switch (frecuencia) {
    case 'diario': 
      return tasaMensual / 30;  // Tasa diaria desde tasa mensual
    case 'semanal': 
      return tasaMensual / 4;   // Tasa semanal desde tasa mensual
    case 'quincenal': 
      return tasaMensual / 2;   // Tasa quincenal desde tasa mensual
    default: 
      return tasaMensual;        // Tasa mensual
  }
}

/**
 * Calcula la cuota por período (fórmula francesa)
 */
function calcularCuotaPorPeriodo(monto, tasaPeriodo, periodos) {
  if (!monto || !tasaPeriodo || !periodos || monto <= 0 || periodos <= 0) return 0;
  if (tasaPeriodo === 0) return Math.round((monto / periodos) * 100) / 100;
  
  const factor = Math.pow(1 + tasaPeriodo, periodos);
  const cuota = monto * (tasaPeriodo * factor) / (factor - 1);
  return Math.round(cuota * 100) / 100;
}

/**
 * Calcula la siguiente fecha de vencimiento según la frecuencia
 */
function calcularSiguienteFecha(fechaBase, numeroPeriodo, frecuencia) {
  const fecha = new Date(fechaBase);
  let diasASumar = 0;
  
  switch (frecuencia) {
    case 'diario':
      diasASumar = numeroPeriodo;
      break;
    case 'semanal':
      diasASumar = numeroPeriodo * 7;
      break;
    case 'quincenal':
      diasASumar = numeroPeriodo * 15;
      break;
    default:
      fecha.setMonth(fecha.getMonth() + numeroPeriodo);
      return fecha;
  }
  
  // Sumar días saltando domingos (día 0 = domingo)
  let diasAgregados = 0;
  while (diasAgregados < diasASumar) {
    fecha.setDate(fecha.getDate() + 1);
    if (fecha.getDay() !== 0) { // 0 = domingo
      diasAgregados++;
    }
  }
  
  return fecha;
}

/**
 * Calcula la cuota mensual equivalente para mostrar en el listado
 */
function calcularCuotaMensual(monto, interesMensual, plazoMeses) {
  if (!monto || !interesMensual || !plazoMeses || monto <= 0 || interesMensual <= 0 || plazoMeses <= 0) {
    return 0;
  }
  const tasaMensual = interesMensual / 100;
  const cuota = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
  return Math.round(cuota * 100) / 100;
}

// ============================================================
// LISTAR TODOS LOS PRÉSTAMOS
// ============================================================
router.get('/', async (req, res) => {
  try {
    const prestamos = await prisma.prestamos.findMany({
      include: {
        clientes: {
          select: { id: true, nombre: true, cedula: true, telefono: true, email: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    const prestamosFormateados = prestamos.map(p => ({
      id: p.id,
      cliente: p.clientes ? {
        id: p.clientes.id,
        nombre: p.clientes.nombre,
        cedula: p.clientes.cedula,
        telefono: p.clientes.telefono,
        email: p.clientes.email
      } : null,
      monto: Number(p.monto),
      interes: Number(p.interes),
      plazo: p.plazo,
      plazo_original: p.plazo_original,
      frecuencia_pago: p.frecuencia_pago,
      estado: p.estado,
      fecha_inicio: p.fecha_inicio,
      saldo_actual: Number(p.saldo_actual),
      cuota_mensual: calcularCuotaMensual(Number(p.monto), Number(p.interes), p.plazo)
    }));

    res.json({ success: true, data: prestamosFormateados });
  } catch (error) {
    console.error('Error en GET /prestamos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// OBTENER UN PRÉSTAMO POR ID
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const prestamo = await prisma.prestamos.findUnique({
      where: { id },
      include: {
        clientes: {
          select: {
            id: true,
            nombre: true,
            cedula: true,
            telefono: true,
            email: true,
            direccion: true
          }
        },
        cuotas: {
          orderBy: { numero: 'asc' }
        }
      }
    });

    if (!prestamo) {
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const tasaPeriodo = tasaPorPeriodo(Number(prestamo.interes), prestamo.frecuencia_pago || 'mensual');
    const periodos = prestamo.plazo_original || prestamo.plazo;
    let cuotaPeriodo = 0;
    let saldo = Number(prestamo.monto);
    
    if (saldo > 0 && tasaPeriodo > 0 && periodos > 0) {
      const factor = Math.pow(1 + tasaPeriodo, periodos);
      cuotaPeriodo = saldo * (tasaPeriodo * factor) / (factor - 1);
      cuotaPeriodo = Math.round(cuotaPeriodo * 100) / 100;
    }

    const cuotasConAmortizacion = prestamo.cuotas.map((cuota) => {
      return {
        id: cuota.id,
        numero: cuota.numero,
        monto: Number(cuota.monto),
        fecha_vencimiento: cuota.fecha_vencimiento,
        fecha_pago: cuota.fecha_pago,
        estado: cuota.estado,
        monto_pagado: cuota.monto_pagado ? Number(cuota.monto_pagado) : null
      };
    });

    const prestamoFormateado = {
      id: prestamo.id,
      cliente: prestamo.clientes ? {
        id: prestamo.clientes.id,
        nombre: prestamo.clientes.nombre,
        cedula: prestamo.clientes.cedula,
        telefono: prestamo.clientes.telefono,
        email: prestamo.clientes.email,
        direccion: prestamo.clientes.direccion
      } : null,
      monto: Number(prestamo.monto),
      interes: Number(prestamo.interes),
      plazo: prestamo.plazo,
      plazo_original: prestamo.plazo_original,
      frecuencia_pago: prestamo.frecuencia_pago,
      estado: prestamo.estado,
      fecha_inicio: prestamo.fecha_inicio,
      saldo_actual: Number(prestamo.saldo_actual),
      cuota_por_periodo: cuotaPeriodo,
      cuotas: cuotasConAmortizacion
    };

    res.json({ success: true, data: prestamoFormateado });
  } catch (error) {
    console.error('Error en GET /prestamos/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// CREAR PRÉSTAMO (CON FRECUENCIA DE PAGO)
// ============================================================
router.post('/', async (req, res) => {
  try {
    const {
      cliente_id,
      monto,
      interes,
      plazo,
      frecuencia_pago,
      tipo_prestamo_id,
      plan_pago_id,
      fecha_inicio
    } = req.body;

    // Validaciones
    if (!cliente_id || !monto || !interes || !plazo) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: cliente_id, monto, interes, plazo'
      });
    }

    const cliente = await prisma.clientes.findUnique({ where: { id: parseInt(cliente_id) } });
    if (!cliente) {
      return res.status(400).json({ success: false, message: 'Cliente no encontrado' });
    }

    // Parámetros del préstamo
    const montoN = parseFloat(monto);
    const interesMensual = parseFloat(interes); // Este es el interés MENSUAL (%)
    const plazoN = parseInt(plazo); // número de períodos
    const frecuencia = frecuencia_pago || 'mensual';
    const fechaInicio = fecha_inicio ? new Date(fecha_inicio) : new Date();

    // Validar frecuencia válida
    const frecuenciasValidas = ['diario', 'semanal', 'quincenal', 'mensual'];
    if (!frecuenciasValidas.includes(frecuencia)) {
      return res.status(400).json({
        success: false,
        message: `Frecuencia inválida. Debe ser: ${frecuenciasValidas.join(', ')}`
      });
    }

    // Calcular tasa por período y cuota por período
    const tasaPeriodo = tasaPorPeriodo(interesMensual, frecuencia);
    const cuotaPeriodo = calcularCuotaPorPeriodo(montoN, tasaPeriodo, plazoN);
    
    if (cuotaPeriodo === 0) {
      return res.status(400).json({
        success: false,
        message: 'Error al calcular la cuota. Verifique los datos ingresados.'
      });
    }

    // Calcular plazo equivalente en meses para guardar en BD
    const plazoMesesEquiv = plazoEnMeses(plazoN, frecuencia);

    const prestamo = await prisma.$transaction(async (tx) => {
      // 1. Crear el préstamo
      const createData = {
        clientes: { connect: { id: parseInt(cliente_id) } },
        monto: montoN,
        interes: interesMensual, // Guardamos el interés MENSUAL
        plazo: Math.round(plazoMesesEquiv * 100) / 100, // plazo en meses (para compatibilidad)
        plazo_original: plazoN, // plazo original en la unidad de la frecuencia
        frecuencia_pago: frecuencia,
        saldo_actual: montoN,
        estado: 'pendiente',
        fecha_inicio: fechaInicio
      };

      // Conectar relaciones opcionales
      if (tipo_prestamo_id && parseInt(tipo_prestamo_id) > 0) {
        createData.tipos_prestamo = { connect: { id: parseInt(tipo_prestamo_id) } };
      }
      if (plan_pago_id && parseInt(plan_pago_id) > 0) {
        createData.planes_pago = { connect: { id: parseInt(plan_pago_id) } };
      }

      const nuevoPrestamo = await tx.prestamos.create({ data: createData });

      // 2. Generar las cuotas según la frecuencia
      let saldoRestante = montoN;

      for (let i = 1; i <= plazoN; i++) {
        // Calcular interés y capital de esta cuota
        const interesCuota = Math.round(saldoRestante * tasaPeriodo * 100) / 100;
        let capitalCuota = cuotaPeriodo - interesCuota;
        
        // Para la última cuota, ajustar el capital para que saldo quede en 0
        if (i === plazoN) {
          capitalCuota = saldoRestante;
        } else if (capitalCuota < 0) {
          capitalCuota = 0;
        }
        
        // Actualizar saldo restante
        saldoRestante = Math.round((saldoRestante - capitalCuota) * 100) / 100;
        if (saldoRestante < 0) saldoRestante = 0;

        // Calcular fecha de vencimiento
        const fechaVencimiento = calcularSiguienteFecha(fechaInicio, i, frecuencia);

        // Crear la cuota
        await tx.cuotas.create({
          data: {
            prestamo_id: nuevoPrestamo.id,
            numero: i,
            monto: cuotaPeriodo,
            fecha_vencimiento: fechaVencimiento,
            estado: 'pendiente'
          }
        });

        // Crear registro de amortización
        await tx.amortizacion.create({
          data: {
            prestamo_id: nuevoPrestamo.id,
            numero_cuota: i,
            capital: Math.round(capitalCuota * 100) / 100,
            interes: interesCuota,
            saldo_restante: saldoRestante,
            fecha_pago: fechaVencimiento,
            estado: 'pendiente'
          }
        });
      }

      // Actualizar el saldo_actual final
      await tx.prestamos.update({
        where: { id: nuevoPrestamo.id },
        data: { saldo_actual: saldoRestante }
      });

      return nuevoPrestamo;
    });

    res.status(201).json({
      success: true,
      message: `Préstamo creado exitosamente con frecuencia ${frecuencia}`,
      data: prestamo
    });
  } catch (error) {
    console.error('Error al crear préstamo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ACTUALIZAR PRÉSTAMO
// ============================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, monto, interes, plazo } = req.body;

    const updateData = {};
    if (estado !== undefined) updateData.estado = estado;
    if (monto !== undefined) updateData.monto = parseFloat(monto);
    if (interes !== undefined) updateData.interes = parseFloat(interes);
    if (plazo !== undefined) updateData.plazo = parseInt(plazo);

    const prestamo = await prisma.prestamos.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({ success: true, data: prestamo });
  } catch (error) {
    console.error('Error al actualizar préstamo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// REGISTRAR PAGO DE UNA CUOTA
// ============================================================
router.patch('/:id/cuotas/:cuotaId/pagar', async (req, res) => {
  try {
    const prestamoId = parseInt(req.params.id);
    const cuotaId = parseInt(req.params.cuotaId);
    const { fecha_pago, monto_pagado, notas } = req.body;

    const cuota = await prisma.cuotas.findFirst({
      where: {
        id: cuotaId,
        prestamo_id: prestamoId
      },
      include: {
        prestamos: true
      }
    });

    if (!cuota) {
      return res.status(404).json({ success: false, message: 'Cuota no encontrada' });
    }

    if (cuota.estado === 'pagado') {
      return res.status(400).json({ success: false, message: 'Esta cuota ya fue pagada' });
    }

    const fechaPago = fecha_pago ? new Date(fecha_pago) : new Date();
    const montoPagado = monto_pagado ? parseFloat(monto_pagado) : cuota.monto;

    if (montoPagado > cuota.monto) {
      return res.status(400).json({
        success: false,
        message: `El monto pagado (${montoPagado}) no puede ser mayor al de la cuota (${cuota.monto})`
      });
    }

    await prisma.cuotas.update({
      where: { id: cuotaId },
      data: {
        estado: montoPagado === cuota.monto ? 'pagado' : 'parcial',
        fecha_pago: fechaPago,
        monto_pagado: montoPagado
      }
    });

    const amortizacion = await prisma.amortizacion.findFirst({
      where: {
        prestamo_id: prestamoId,
        numero_cuota: cuota.numero
      }
    });

    if (amortizacion) {
      await prisma.amortizacion.update({
        where: { id: amortizacion.id },
        data: {
          estado: montoPagado === cuota.monto ? 'pagado' : 'parcial',
          fecha_pago: fechaPago
        }
      });
    }

    let usuarioId = req.user?.id;
    const usuarioExiste = usuarioId
      ? await prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { id: true } })
      : null;

    if (!usuarioExiste) {
      const fallback = await prisma.usuarios.findFirst({
        where: { estado: 'activo' },
        select: { id: true }
      });
      if (!fallback) {
        return res.status(400).json({ success: false, message: 'No hay usuarios activos en el sistema' });
      }
      usuarioId = fallback.id;
    }

    await prisma.pagos.create({
      data: {
        prestamo: { connect: { id: prestamoId } },
        cuota: { connect: { id: cuotaId } },
        monto: montoPagado,
        fecha_pago: fechaPago,
        metodo_pago: 'efectivo',
        usuario: { connect: { id: usuarioId } },
        notas: notas || null
      }
    });

    const cuotasPagadas = await prisma.cuotas.aggregate({
      where: {
        prestamo_id: prestamoId,
        estado: { in: ['pagado', 'parcial'] }
      },
      _sum: {
        monto_pagado: true
      }
    });

    const totalPagado = cuotasPagadas._sum.monto_pagado || 0;
    const nuevoSaldo = cuota.prestamos.monto - totalPagado;

    await prisma.prestamos.update({
      where: { id: prestamoId },
      data: { saldo_actual: nuevoSaldo > 0 ? nuevoSaldo : 0 }
    });

    const cuotasPendientes = await prisma.cuotas.count({
      where: {
        prestamo_id: prestamoId,
        estado: { not: 'pagado' }
      }
    });

    if (cuotasPendientes === 0) {
      await prisma.prestamos.update({
        where: { id: prestamoId },
        data: { estado: 'pagado' }
      });
    }

    res.json({ success: true, message: 'Pago registrado exitosamente' });
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ACTUALIZAR ESTADO DE UN PRÉSTAMO
// ============================================================
router.put('/:id/estado', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { estado } = req.body;

    const estadosValidos = ['pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado', 'cancelado'];
    
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ 
        success: false, 
        message: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}` 
      });
    }

    const prestamoExistente = await prisma.prestamos.findUnique({ where: { id } });
    if (!prestamoExistente) {
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const prestamo = await prisma.prestamos.update({
      where: { id },
      data: { estado }
    });

    res.json({ 
      success: true, 
      message: 'Estado actualizado exitosamente',
      data: { id: prestamo.id, estado: prestamo.estado }
    });
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
