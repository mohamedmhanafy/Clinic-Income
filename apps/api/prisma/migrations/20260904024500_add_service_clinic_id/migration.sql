-- DropIndex
DROP INDEX "services_code_key";

-- AlterTable
ALTER TABLE "services" ADD COLUMN "clinic_id" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "services_clinic_id_code_key" ON "services"("clinic_id", "code");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
