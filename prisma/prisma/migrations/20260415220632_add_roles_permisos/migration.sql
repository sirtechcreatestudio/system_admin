-- CreateTable
CREATE TABLE `activos_financiados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prestamo_id` INTEGER NULL,
    `tipo` ENUM('vehiculo', 'inmueble', 'otro') NULL,
    `descripcion` TEXT NULL,
    `valor` DECIMAL(10, 2) NULL,

    INDEX `prestamo_id`(`prestamo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amortizacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prestamo_id` INTEGER NULL,
    `numero_cuota` INTEGER NULL,
    `capital` DECIMAL(10, 2) NULL,
    `interes` DECIMAL(10, 2) NULL,
    `saldo_restante` DECIMAL(10, 2) NULL,
    `fecha_pago` DATE NULL,
    `estado` ENUM('pendiente', 'pagado', 'atrasado') NULL,

    INDEX `prestamo_id`(`prestamo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `fecha_apertura` TIMESTAMP(0) NULL,
    `fecha_cierre` TIMESTAMP(0) NULL,
    `estado` ENUM('abierta', 'cerrada') NULL,
    `sucursal_id` INTEGER NULL,

    INDEX `usuario_id`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NULL,
    `cedula` VARCHAR(20) NULL,
    `telefono` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `direccion` TEXT NULL,
    `estado` ENUM('activo', 'inactivo') NULL DEFAULT 'activo',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `cedula`(`cedula`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion` (
    `clave` VARCHAR(50) NOT NULL,
    `valor` VARCHAR(100) NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_mora` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `porcentaje` DECIMAL(5, 2) NULL,
    `dias_gracia` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuentas_cobrar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `total_deuda` DECIMAL(10, 2) NULL,
    `estado` ENUM('al_dia', 'atrasado', 'moroso') NULL,

    INDEX `idx_cobros`(`cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuotas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prestamo_id` INTEGER NOT NULL,
    `numero` INTEGER NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fecha_vencimiento` DATETIME(3) NOT NULL,
    `fecha_pago` DATETIME(3) NULL,
    `monto_pagado` DECIMAL(10, 2) NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gestiones_cobro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `usuario_id` INTEGER NULL,
    `comentario` TEXT NULL,
    `resultado` VARCHAR(100) NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cliente_id`(`cliente_id`),
    INDEX `usuario_id`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_cambios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tabla` VARCHAR(50) NULL,
    `registro_id` INTEGER NULL,
    `accion` VARCHAR(50) NULL,
    `usuario_id` INTEGER NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs_auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `accion` VARCHAR(100) NULL,
    `tabla_afectada` VARCHAR(50) NULL,
    `registro_id` INTEGER NULL,
    `ip` VARCHAR(50) NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `usuario_id`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metodos_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuota_id` INTEGER NULL,
    `monto` DECIMAL(10, 2) NULL,
    `estado` ENUM('activa', 'pagada', 'eliminada') NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `prestamo_id` INTEGER NULL,
    `dias_atraso` INTEGER NULL,
    `fecha_generada` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cuota_id`(`cuota_id`),
    INDEX `idx_mora`(`prestamo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caja_id` INTEGER NULL,
    `tipo` ENUM('ingreso', 'egreso') NULL,
    `monto` DECIMAL(10, 2) NULL,
    `descripcion` TEXT NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `caja_id`(`caja_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `mensaje` TEXT NULL,
    `tipo` VARCHAR(50) NULL,
    `estado` ENUM('pendiente', 'enviado') NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cliente_id`(`cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prestamo_id` INTEGER NOT NULL,
    `cuota_id` INTEGER NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fecha_pago` DATETIME(3) NOT NULL,
    `metodo_pago` VARCHAR(50) NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `notas` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permisos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `modulo` VARCHAR(50) NULL,

    UNIQUE INDEX `permisos_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `planes_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NULL,
    `dias_intervalo` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prestamos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `tipo_prestamo_id` INTEGER NULL,
    `plan_pago_id` INTEGER NULL,
    `monto` DECIMAL(10, 2) NULL,
    `interes` DECIMAL(5, 2) NULL,
    `plazo` INTEGER NULL,
    `estado` ENUM('pendiente', 'aprobado', 'activo', 'atrasado', 'pagado', 'castigado') NULL,
    `fecha_inicio` DATE NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `tiene_mora` BOOLEAN NULL DEFAULT false,
    `total_mora` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `deleted_at` TIMESTAMP(0) NULL,
    `sistema_calculo` VARCHAR(20) NULL DEFAULT 'personalizado',
    `frecuencia_pago` VARCHAR(15) NULL DEFAULT 'mensual',
    `saldo_actual` DECIMAL(10, 2) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `nombre` VARCHAR(100) NULL,
    `telefono` VARCHAR(20) NULL,
    `tipo` ENUM('personal', 'laboral') NULL,

    INDEX `cliente_id`(`cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol_permisos` (
    `rol_id` INTEGER NOT NULL,
    `permiso_id` INTEGER NOT NULL,

    INDEX `permiso_id`(`permiso_id`),
    PRIMARY KEY (`rol_id`, `permiso_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,
    `descripcion` VARCHAR(255) NULL,

    UNIQUE INDEX `roles_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sucursales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_prestamo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NULL,
    `tasa_interes` DECIMAL(5, 2) NULL,
    `plazo_max` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NULL,
    `email` VARCHAR(100) NULL,
    `password` TEXT NULL,
    `rol_id` INTEGER NULL,
    `estado` ENUM('activo', 'inactivo') NULL DEFAULT 'activo',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `email`(`email`),
    INDEX `rol_id`(`rol_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activos_financiados` ADD CONSTRAINT `activos_financiados_ibfk_1` FOREIGN KEY (`prestamo_id`) REFERENCES `prestamos`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `amortizacion` ADD CONSTRAINT `amortizacion_ibfk_1` FOREIGN KEY (`prestamo_id`) REFERENCES `prestamos`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `caja` ADD CONSTRAINT `caja_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cuentas_cobrar` ADD CONSTRAINT `cuentas_cobrar_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cuotas` ADD CONSTRAINT `cuotas_prestamo_id_fkey` FOREIGN KEY (`prestamo_id`) REFERENCES `prestamos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gestiones_cobro` ADD CONSTRAINT `gestiones_cobro_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `gestiones_cobro` ADD CONSTRAINT `gestiones_cobro_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `logs_auditoria` ADD CONSTRAINT `logs_auditoria_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `moras` ADD CONSTRAINT `moras_ibfk_1` FOREIGN KEY (`cuota_id`) REFERENCES `cuotas`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `moras` ADD CONSTRAINT `moras_ibfk_2` FOREIGN KEY (`prestamo_id`) REFERENCES `prestamos`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `movimientos_caja` ADD CONSTRAINT `movimientos_caja_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `caja`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_prestamo_id_fkey` FOREIGN KEY (`prestamo_id`) REFERENCES `prestamos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_cuota_id_fkey` FOREIGN KEY (`cuota_id`) REFERENCES `cuotas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prestamos` ADD CONSTRAINT `prestamos_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prestamos` ADD CONSTRAINT `prestamos_tipo_prestamo_id_fkey` FOREIGN KEY (`tipo_prestamo_id`) REFERENCES `tipos_prestamo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prestamos` ADD CONSTRAINT `prestamos_plan_pago_id_fkey` FOREIGN KEY (`plan_pago_id`) REFERENCES `planes_pago`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referencias` ADD CONSTRAINT `referencias_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rol_permisos` ADD CONSTRAINT `rol_permisos_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rol_permisos` ADD CONSTRAINT `rol_permisos_ibfk_2` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
