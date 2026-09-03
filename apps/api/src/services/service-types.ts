import type { ServiceCreateInput, ServiceDto, ServiceUpdateInput } from '@clinic/shared';
import type { Service } from '@prisma/client';
import { prisma } from '../prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Service types (Examination, Consultation, and anything added later).
 *
 * These are data, not code. Adding Follow-up or Procedure is a row here plus a price per
 * clinic - no migration, no change to the daily-entry or reporting logic.
 */

function toServiceDto(service: Service): ServiceDto {
  return {
    id: service.id,
    clinicId: service.clinicId,
    code: service.code,
    nameEn: service.nameEn,
    nameAr: service.nameAr,
    status: service.status,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}

export async function listServices(clinicId: number, includeInactive = true): Promise<ServiceDto[]> {
  const services = await prisma.service.findMany({
    where: includeInactive ? { clinicId } : { clinicId, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return services.map(toServiceDto);
}

export async function createService(input: ServiceCreateInput): Promise<ServiceDto> {
  const clash = await prisma.service.findUnique({
    where: { clinicId_code: { clinicId: input.clinicId, code: input.code } },
  });
  if (clash) throw AppError.conflict(`A service with code "${input.code}" already exists for this clinic.`);

  const service = await prisma.service.create({
    data: {
      clinicId: input.clinicId,
      code: input.code,
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      status: input.status,
      sortOrder: input.sortOrder,
    },
  });
  return toServiceDto(service);
}

export async function updateService(id: number, input: ServiceUpdateInput): Promise<ServiceDto> {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Service not found.');

  const service = await prisma.service.update({
    where: { id },
    data: {
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  return toServiceDto(service);
}

export async function deleteService(id: number): Promise<void> {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Service not found.');

  const incomeLineCount = await prisma.dailyActivityLine.count({ where: { serviceId: id } });
  console.log(`[deleteService] id=${id} name="${existing.nameEn}" incomeLines=${incomeLineCount}`);

  if (incomeLineCount > 0) {
    console.log(`[deleteService] blocked — has income entries`);
    throw AppError.conflict(
      `"${existing.nameEn}" cannot be deleted because it has recorded income entries. ` +
        'Set it to Inactive to hide it from the entry form instead.',
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const priceCount = await tx.clinicPrice.count({ where: { serviceId: id } });
      console.log(`[deleteService] deleting ${priceCount} price rows then the service`);
      await tx.clinicPrice.deleteMany({ where: { serviceId: id } });
      await tx.service.delete({ where: { id } });
    });
    console.log(`[deleteService] id=${id} deleted successfully`);
  } catch (err) {
    console.error(`[deleteService] transaction failed:`, err);
    throw AppError.conflict(
      `"${existing.nameEn}" cannot be deleted. It may still have dependent records.`,
    );
  }
}

