import type { ClinicCreateInput, ClinicDto, ClinicUpdateInput } from '@clinic/shared';
import type { Clinic } from '@prisma/client';
import { prisma } from '../prisma.js';
import { AppError } from '../lib/errors.js';

function toClinicDto(clinic: Clinic): ClinicDto {
  return {
    id: clinic.id,
    name: clinic.name,
    status: clinic.status,
    createdAt: clinic.createdAt.toISOString(),
    updatedAt: clinic.updatedAt.toISOString(),
  };
}

export async function listClinics(includeInactive = false): Promise<ClinicDto[]> {
  const clinics = await prisma.clinic.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    orderBy: [{ name: 'asc' }],
  });
  return clinics.map(toClinicDto);
}

export async function getClinic(id: number): Promise<ClinicDto> {
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) throw AppError.notFound('Clinic not found.');
  return toClinicDto(clinic);
}

/**
 * The database enforces exact-name uniqueness. This adds a case-insensitive check so that
 * "Rodayna" and "rodayna" cannot both be created, which would be confusing in a dropdown.
 */
async function assertNameAvailable(name: string, excludeId?: number): Promise<void> {
  const clash = await prisma.clinic.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash) {
    throw AppError.conflict(`A clinic named "${clash.name}" already exists.`);
  }
}

export async function createClinic(input: ClinicCreateInput): Promise<ClinicDto> {
  await assertNameAvailable(input.name);
  const clinic = await prisma.clinic.create({
    data: { name: input.name, status: input.status },
  });
  return toClinicDto(clinic);
}

export async function updateClinic(id: number, input: ClinicUpdateInput): Promise<ClinicDto> {
  const existing = await prisma.clinic.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Clinic not found.');
  if (input.name !== undefined) await assertNameAvailable(input.name, id);

  const clinic = await prisma.clinic.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return toClinicDto(clinic);
}

export async function deleteClinic(id: number): Promise<void> {
  const existing = await prisma.clinic.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Clinic not found.');
  await prisma.clinic.delete({ where: { id } });
}
