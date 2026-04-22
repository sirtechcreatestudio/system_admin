-- CreateEnum
CREATE TYPE "vehiculos_tipo" AS ENUM ('motor', 'carro', 'camion', 'bicicleta', 'otro');

-- CreateEnum
CREATE TYPE "vehiculos_estado" AS ENUM ('disponible', 'vendido', 'en_proceso');

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
CREATE UNIQUE INDEX "vehiculos_codigo_key" ON "vehiculos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_chassis_key" ON "vehiculos"("chassis");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
