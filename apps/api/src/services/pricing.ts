import type {
  EffectivePriceDto,
  PriceCreateInput,
  PriceDto,
  PriceScheduleChangeInput,
  PriceUpdateInput,
} from '@clinic/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { PrismaTransactionClient } from '../prisma.js';
import { addDays, fromDbDate, toDbDate } from '../lib/date.js';
import { toMoney } from '../lib/money.js';
import { AppError } from '../lib/errors.js';

type PriceWithService = Prisma.ClinicPriceGetPayload<{ include: { service: true } }>;

function toPriceDto(row: PriceWithService): PriceDto {
  return {
    id: row.id,
    clinicId: row.clinicId,
    serviceId: row.serviceId,
    serviceCode: row.service.code,
    serviceNameEn: row.service.nameEn,
    serviceNameAr: row.service.nameAr,
    fee: toMoney(row.fee),
    effectiveFrom: fromDbDate(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? fromDbDate(row.effectiveTo) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPrices(clinicId: number): Promise<PriceDto[]> {
  const rows = await prisma.clinicPrice.findMany({
    where: { clinicId },
    include: { service: true },
    orderBy: [{ effectiveFrom: 'desc' }, { serviceId: 'asc' }],
  });
  return rows.map(toPriceDto);
}

export async function createPrice(clinicId: number, input: PriceCreateInput): Promise<PriceDto> {
  const row = await prisma.clinicPrice.create({
    data: {
      clinicId,
      serviceId: input.serviceId,
      fee: input.fee,
      effectiveFrom: toDbDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? toDbDate(input.effectiveTo) : null,
    },
    include: { service: true },
  });
  return toPriceDto(row);
}

export async function updatePrice(priceId: number, input: PriceUpdateInput): Promise<PriceDto> {
  const existing = await prisma.clinicPrice.findUnique({ where: { id: priceId } });
  if (!existing) throw AppError.notFound('Price not found.');

  const row = await prisma.clinicPrice.update({
    where: { id: priceId },
    data: {
      ...(input.fee !== undefined ? { fee: input.fee } : {}),
      ...(input.effectiveFrom !== undefined
        ? { effectiveFrom: toDbDate(input.effectiveFrom) }
        : {}),
      ...(input.effectiveTo !== undefined
        ? { effectiveTo: input.effectiveTo ? toDbDate(input.effectiveTo) : null }
        : {}),
    },
    include: { service: true },
  });
  return toPriceDto(row);
}

export async function deletePrice(priceId: number): Promise<void> {
  const existing = await prisma.clinicPrice.findUnique({ where: { id: priceId } });
  if (!existing) throw AppError.notFound('Price not found.');
  await prisma.clinicPrice.delete({ where: { id: priceId } });
}

/**
 * The fee for one service at one clinic on one date, or null when no price period covers
 * that date.
 *
 * The exclusion constraint on `clinic_prices` guarantees at most one match, so this lookup
 * is unambiguous by construction. Callers must treat null as an error rather than falling
 * back to zero or to today's price - silently booking income at the wrong fee is precisely
 * the failure this design exists to prevent.
 */
export async function resolveFee(
  client: PrismaTransactionClient,
  clinicId: number,
  serviceId: number,
  date: string,
): Promise<Prisma.Decimal | null> {
  const target = toDbDate(date);
  const row = await client.clinicPrice.findFirst({
    where: {
      clinicId,
      serviceId,
      effectiveFrom: { lte: target },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
    },
  });
  return row?.fee ?? null;
}

/** Every active service with the fee applicable at this clinic on this date. */
export async function getEffectivePrices(
  clinicId: number,
  date: string,
): Promise<EffectivePriceDto[]> {
  const target = toDbDate(date);
  const [services, prices] = await Promise.all([
    prisma.service.findMany({
      where: { clinicId, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.clinicPrice.findMany({
      where: {
        clinicId,
        effectiveFrom: { lte: target },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
      },
    }),
  ]);

  const byService = new Map(prices.map((price) => [price.serviceId, price]));

  return services.map((service) => {
    const price = byService.get(service.id);
    return {
      serviceId: service.id,
      serviceCode: service.code,
      serviceNameEn: service.nameEn,
      serviceNameAr: service.nameAr,
      sortOrder: service.sortOrder,
      fee: price ? toMoney(price.fee) : null,
      priceId: price?.id ?? null,
      effectiveFrom: price ? fromDbDate(price.effectiveFrom) : null,
      effectiveTo: price?.effectiveTo ? fromDbDate(price.effectiveTo) : null,
    };
  });
}

/**
 * Schedule a fee change from a date, keeping the price timeline contiguous and
 * non-overlapping.
 *
 * Raising the Rodayna examination fee to 350 from 2027-01-01 while the 300 fee is still
 * open-ended would overlap it, and the database would refuse the insert. Rather than
 * making the user close the old period by hand, this does both steps in one transaction:
 *
 *   before   300 |2026-01-01 ............. open-ended|
 *   after    300 |2026-01-01 .. 2026-12-31| 350 |2027-01-01 .. open-ended|
 *
 * Crucially the old row is not edited in place - it keeps its 300 fee and simply stops on
 * 2026-12-31, so every 2026 record still resolves to 300 and every stored 2026 income
 * figure remains exactly as it was.
 */
export async function schedulePriceChange(
  clinicId: number,
  input: PriceScheduleChangeInput,
): Promise<PriceDto> {
  const { serviceId, fee, effectiveFrom } = input;
  const startDate = toDbDate(effectiveFrom);

  const created = await prisma.$transaction(async (tx) => {
    // A period that already starts on exactly this date is a correction, not a new period.
    const sameStart = await tx.clinicPrice.findFirst({
      where: { clinicId, serviceId, effectiveFrom: startDate },
    });
    if (sameStart) {
      return tx.clinicPrice.update({
        where: { id: sameStart.id },
        data: { fee },
        include: { service: true },
      });
    }

    // Close the period running on the day before the change takes effect.
    const running = await tx.clinicPrice.findFirst({
      where: {
        clinicId,
        serviceId,
        effectiveFrom: { lt: startDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
      },
    });
    if (running) {
      await tx.clinicPrice.update({
        where: { id: running.id },
        data: { effectiveTo: toDbDate(addDays(effectiveFrom, -1)) },
      });
    }

    // If a later period already exists, the new one stops the day before it begins.
    const next = await tx.clinicPrice.findFirst({
      where: { clinicId, serviceId, effectiveFrom: { gt: startDate } },
      orderBy: { effectiveFrom: 'asc' },
    });

    return tx.clinicPrice.create({
      data: {
        clinicId,
        serviceId,
        fee,
        effectiveFrom: startDate,
        effectiveTo: next ? toDbDate(addDays(fromDbDate(next.effectiveFrom), -1)) : null,
      },
      include: { service: true },
    });
  });

  return toPriceDto(created);
}
