-- CreateEnum
CREATE TYPE "vehiculos_tipo" AS ENUM ('motor', 'carro', 'camion', 'bicicleta', 'otro');

-- CreateEnum
CREATE TYPE "vehiculos_estado" AS ENUM ('disponible', 'vendido', 'en_proceso');

-- CreateEnum
CREATE TYPE "activos_financiados_tipo" AS ENUM ('vehiculo', 'inmueble', 'otro');

-- CreateEnum
CREATE TYPE "movimientos_caja_tipo" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "cuentas_cobrar_estado" AS ENUM ('al_dia', 'atrasado', 'moroso');

-- CreateEnum
CREATE TYPE "moras_estado" AS ENUM ('activa', 'pagada', 'eliminada');

-- CreateEnum
CREATE TYPE "caja_estado" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "notificaciones_estado" AS ENUM ('pendiente', 'enviado');

-- CreateEnum
CREATE TYPE "referencias_tipo" AS ENUM ('personal', 'laboral');

-- CreateEnum
CREATE TYPE "cuotas_estado" AS ENUM ('pendiente', 'pagado', 'atrasado');

-- CreateEnum
CREATE TYPE "usuarios_estado" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "clientes_estado" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "amortizacion_estado" AS ENUM ('pendiente', 'pagado', 'atrasado');

-- CreateEnum
CREATE TYPE "prestamos_estado" AS ENUM ('pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado');

-- CreateTable
CREATE TABLE "activos_financiados" (
    "id" SERIAL NOT NULL,
    "prestamo_id" INTEGER,
    "tipo" "activos_financiados_tipo",
    "descripcion" TEXT,
    "valor" DECIMAL(10,2),

    CONSTRAINT "activos_financiados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amortizacion" (
    "id" SERIAL NOT NULL,
    "prestamo_id" INTEGER,
    "numero_cuota" INTEGER,
    "capital" DECIMAL(10,2),
    "interes" DECIMAL(10,2),
    "saldo_restante" DECIMAL(10,2),
    "fecha_pago" DATE,
    "estado" "amortizacion_estado",

    CONSTRAINT "amortizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "fecha_apertura" TIMESTAMP(3),
    "fecha_cierre" TIMESTAMP(3),
    "estado" "caja_estado",
    "sucursal_id" INTEGER,

    CONSTRAINT "caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100),
    "cedula" VARCHAR(20),
    "telefono" VARCHAR(20),
    "email" VARCHAR(100),
    "direccion" TEXT,
    "estado" "clientes_estado" DEFAULT 'activo',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "clave" VARCHAR(50) NOT NULL,
    "valor" VARCHAR(100),

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "configuracion_mora" (
    "id" SERIAL NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "dias_gracia" INTEGER,

    CONSTRAINT "configuracion_mora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_cobrar" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "total_deuda" DECIMAL(10,2),
    "estado" "cuentas_cobrar_estado",

    CONSTRAINT "cuentas_cobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas" (
    "id" SERIAL NOT NULL,
    "prestamo_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "fecha_pago" TIMESTAMP(3),
    "monto_pagado" DECIMAL(10,2),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestiones_cobro" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "usuario_id" INTEGER,
    "comentario" TEXT,
    "resultado" VARCHAR(100),
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestiones_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cambios" (
    "id" SERIAL NOT NULL,
    "tabla" VARCHAR(50),
    "registro_id" INTEGER,
    "accion" VARCHAR(50),
    "usuario_id" INTEGER,
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_cambios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "accion" VARCHAR(100),
    "tabla_afectada" VARCHAR(50),
    "registro_id" INTEGER,
    "ip" VARCHAR(50),
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos_pago" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50),

    CONSTRAINT "metodos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moras" (
    "id" SERIAL NOT NULL,
    "cuota_id" INTEGER,
    "monto" DECIMAL(10,2),
    "estado" "moras_estado",
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "prestamo_id" INTEGER,
    "dias_atraso" INTEGER,
    "fecha_generada" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_caja" (
    "id" SERIAL NOT NULL,
    "caja_id" INTEGER,
    "tipo" "movimientos_caja_tipo",
    "monto" DECIMAL(10,2),
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "mensaje" TEXT,
    "tipo" VARCHAR(50),
    "estado" "notificaciones_estado",
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "prestamo_id" INTEGER NOT NULL,
    "cuota_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha_pago" TIMESTAMP(3) NOT NULL,
    "metodo_pago" VARCHAR(50) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "modulo" VARCHAR(50),

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_pago" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50),
    "dias_intervalo" INTEGER,

    CONSTRAINT "planes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestamos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "tipo_prestamo_id" INTEGER,
    "plan_pago_id" INTEGER,
    "monto" DECIMAL(10,2),
    "interes" DECIMAL(5,2),
    "plazo" INTEGER,
    "plazo_original" INTEGER,
    "estado" "prestamos_estado",
    "fecha_inicio" DATE,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "tiene_mora" BOOLEAN DEFAULT false,
    "total_mora" DECIMAL(10,2) DEFAULT 0.00,
    "deleted_at" TIMESTAMP(3),
    "sistema_calculo" VARCHAR(20) DEFAULT 'personalizado',
    "frecuencia_pago" VARCHAR(15) DEFAULT 'mensual',
    "saldo_actual" DECIMAL(10,2),

    CONSTRAINT "prestamos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencias" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "nombre" VARCHAR(100),
    "telefono" VARCHAR(20),
    "tipo" "referencias_tipo",

    CONSTRAINT "referencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "rol_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100),

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_prestamo" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50),
    "tasa_interes" DECIMAL(5,2),
    "plazo_max" INTEGER,

    CONSTRAINT "tipos_prestamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" TEXT NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "estado" "usuarios_estado" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "tipo" "vehiculos_tipo" NOT NULL DEFAULT 'motor',
    "marca" VARCHAR(100) NOT NULL,
    "modelo" VARCHAR(100) NOT NULL,
    "anio" INTEGER NOT NULL,
    "color" VARCHAR(50),
    "chassis" VARCHAR(100),
    "placa" VARCHAR(20),
    "precio" DECIMAL(10,2),
    "detalles" TEXT,
    "estado" "vehiculos_estado" NOT NULL DEFAULT 'disponible',
    "cliente_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activos_financiados_prestamo_id_idx" ON "activos_financiados"("prestamo_id");

-- CreateIndex
CREATE INDEX "amortizacion_prestamo_id_idx" ON "amortizacion"("prestamo_id");

-- CreateIndex
CREATE INDEX "caja_usuario_id_idx" ON "caja"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cedula_key" ON "clientes"("cedula");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_cliente_id_idx" ON "cuentas_cobrar"("cliente_id");

-- CreateIndex
CREATE INDEX "gestiones_cobro_cliente_id_idx" ON "gestiones_cobro"("cliente_id");

-- CreateIndex
CREATE INDEX "gestiones_cobro_usuario_id_idx" ON "gestiones_cobro"("usuario_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_usuario_id_idx" ON "logs_auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "moras_cuota_id_idx" ON "moras"("cuota_id");

-- CreateIndex
CREATE INDEX "moras_prestamo_id_idx" ON "moras"("prestamo_id");

-- CreateIndex
CREATE INDEX "movimientos_caja_caja_id_idx" ON "movimientos_caja"("caja_id");

-- CreateIndex
CREATE INDEX "notificaciones_cliente_id_idx" ON "notificaciones"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_nombre_key" ON "permisos"("nombre");

-- CreateIndex
CREATE INDEX "referencias_cliente_id_idx" ON "referencias"("cliente_id");

-- CreateIndex
CREATE INDEX "rol_permisos_permiso_id_idx" ON "rol_permisos"("permiso_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_rol_id_idx" ON "usuarios"("rol_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_codigo_key" ON "vehiculos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_chassis_key" ON "vehiculos"("chassis");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");

-- AddForeignKey
ALTER TABLE "activos_financiados" ADD CONSTRAINT "activos_financiados_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "amortizacion" ADD CONSTRAINT "amortizacion_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "caja" ADD CONSTRAINT "caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestiones_cobro" ADD CONSTRAINT "gestiones_cobro_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gestiones_cobro" ADD CONSTRAINT "gestiones_cobro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moras" ADD CONSTRAINT "moras_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moras" ADD CONSTRAINT "moras_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestamos" ADD CONSTRAINT "prestamos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestamos" ADD CONSTRAINT "prestamos_plan_pago_id_fkey" FOREIGN KEY ("plan_pago_id") REFERENCES "planes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestamos" ADD CONSTRAINT "prestamos_tipo_prestamo_id_fkey" FOREIGN KEY ("tipo_prestamo_id") REFERENCES "tipos_prestamo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referencias" ADD CONSTRAINT "referencias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
