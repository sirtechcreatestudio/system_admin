/*
  Warnings:

  - Made the column `nombre` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rol_id` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `usuarios` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `usuarios` DROP FOREIGN KEY `usuarios_ibfk_1`;

-- AlterTable
ALTER TABLE `usuarios` MODIFY `nombre` VARCHAR(100) NOT NULL,
    MODIFY `email` VARCHAR(100) NOT NULL,
    MODIFY `password` TEXT NOT NULL,
    MODIFY `rol_id` INTEGER NOT NULL,
    MODIFY `estado` ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    MODIFY `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
