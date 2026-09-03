-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "clinics" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_prices" (
    "id" SERIAL NOT NULL,
    "clinic_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activities" (
    "id" SERIAL NOT NULL,
    "clinic_id" INTEGER NOT NULL,
    "activity_date" DATE NOT NULL,
    "total_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity_lines" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_fee" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "daily_activity_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_name_key" ON "clinics"("name");

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");

-- CreateIndex
CREATE INDEX "clinic_prices_clinic_id_service_id_effective_from_idx" ON "clinic_prices"("clinic_id", "service_id", "effective_from");

-- CreateIndex
CREATE INDEX "daily_activities_activity_date_idx" ON "daily_activities"("activity_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_activities_clinic_id_activity_date_key" ON "daily_activities"("clinic_id", "activity_date");

-- CreateIndex
CREATE INDEX "daily_activity_lines_service_id_idx" ON "daily_activity_lines"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_activity_lines_activity_id_service_id_key" ON "daily_activity_lines"("activity_id", "service_id");

-- AddForeignKey
ALTER TABLE "clinic_prices" ADD CONSTRAINT "clinic_prices_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_prices" ADD CONSTRAINT "clinic_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity_lines" ADD CONSTRAINT "daily_activity_lines_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "daily_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity_lines" ADD CONSTRAINT "daily_activity_lines_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
