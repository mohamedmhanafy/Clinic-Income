import type {
  DailyActivityDto,
  DailyEntryViewDto,
  DailyLineDto,
  DailyUpsertInput,
} from '@clinic/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { fromDbDate, toDbDate } from '../lib/date.js';
import { lineTotal, sumMoney, toMoney } from '../lib/money.js';
import { AppError } from '../lib/errors.js';
import { getEffectivePrices, resolveFee } from './pricing.js';

/**
 * Service codes used only to build the flat examination/consultation convenience fields on
 * the response. Nothing in the write path depends on them: a clinic-day is stored as one
 * line per service, so adding Follow-up or Procedure later needs no change here.
 */
const EXAMINATION_CODE = 'EXAMINATION';
const CONSULTATION_CODE = 'CONSULTATION';

type ActivityWithLines = Prisma.DailyActivityGetPayload<{
  include: { lines: { include: { service: true } }; clinic: true };
}>;

export function toLineDto(
  line: Prisma.DailyActivityLineGetPayload<{ include: { service: true } }>,
): DailyLineDto {
  return {
    serviceId: line.serviceId,
    serviceCode: line.service.code,
    serviceNameEn: line.service.nameEn,
    serviceNameAr: line.service.nameAr,
    sortOrder: line.service.sortOrder,
    quantity: line.quantity,
    unitFee: toMoney(line.unitFee),
    lineTotal: toMoney(line.lineTotal),
  };
}

function projectFlatFields(lines: DailyLineDto[]) {
  const examination = lines.find((line) => line.serviceCode === EXAMINATION_CODE);
  const consultation = lines.find((line) => line.serviceCode === CONSULTATION_CODE);
  return {
    examinationCount: examination?.quantity ?? 0,
    examinationFeeApplied: examination?.unitFee ?? null,
    examinationIncome: examination?.lineTotal ?? '0.00',
    consultationCount: consultation?.quantity ?? 0,
    consultationFeeApplied: consultation?.unitFee ?? null,
    consultationIncome: consultation?.lineTotal ?? '0.00',
  };
}

function sortLines(lines: DailyLineDto[]): DailyLineDto[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder || a.serviceId - b.serviceId);
}

function toDailyDto(activity: ActivityWithLines): DailyActivityDto {
  const lines = sortLines(activity.lines.map(toLineDto));
  return {
    id: activity.id,
    clinicId: activity.clinicId,
    clinicName: activity.clinic.name,
    date: fromDbDate(activity.activityDate),
    note: activity.note,
    lines,
    totalDailyIncome: toMoney(activity.totalIncome),
    exists: true,
    ...projectFlatFields(lines),
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

function blankDailyDto(clinicId: number, clinicName: string, date: string): DailyActivityDto {
  return {
    id: null,
    clinicId,
    clinicName,
    date,
    note: null,
    lines: [],
    totalDailyIncome: '0.00',
    exists: false,
    ...projectFlatFields([]),
    createdAt: null,
    updatedAt: null,
  };
}

export async function getDailyEntryView(
  clinicId: number,
  date: string,
): Promise<DailyEntryViewDto> {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) throw AppError.notFound('Clinic not found.');

  const [activity, effectivePrices] = await Promise.all([
    prisma.dailyActivity.findUnique({
      where: { clinicId_activityDate: { clinicId, activityDate: toDbDate(date) } },
      include: { lines: { include: { service: true } }, clinic: true },
    }),
    getEffectivePrices(clinicId, date),
  ]);

  return {
    activity: activity ? toDailyDto(activity) : blankDailyDto(clinicId, clinic.name, date),
    effectivePrices,
  };
}

/**
 * Create or update the record for one clinic-day.
 *
 * Upsert rather than create: keying on (clinic, date) makes "edit the existing record
 * instead of creating a duplicate" the only possible outcome, and makes the call
 * idempotent.
 *
 * Fee selection is the heart of historical integrity:
 *   - a line that already exists keeps the fee frozen onto it when it was first saved, so
 *     correcting a typo in a count never re-prices a historical record;
 *   - a new line reads the price schedule effective ON THE ACTIVITY DATE, never today;
 *   - reapplyPriceSchedule re-reads the schedule for that same activity date, which is the
 *     repair path for a record saved against a mis-entered price row.
 *
 * In no case is a present-day price applied to a past date.
 */
export async function upsertDaily(
  input: DailyUpsertInput,
  userId: number | null,
): Promise<DailyEntryViewDto> {
  const { clinicId, date, lines, note, reapplyPriceSchedule } = input;

  await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw AppError.notFound('Clinic not found.');

    const activityDate = toDbDate(date);
    const existing = await tx.dailyActivity.findUnique({
      where: { clinicId_activityDate: { clinicId, activityDate } },
      include: { lines: true },
    });

    if (!existing && clinic.status === 'INACTIVE') {
      throw AppError.badRequest(
        `${clinic.name} is inactive, so new income records cannot be added to it. Reactivate the clinic first.`,
      );
    }

    const requestedIds = lines.map((line) => line.serviceId);
    const services = await tx.service.findMany({ where: { id: { in: requestedIds } } });
    if (services.length !== requestedIds.length) {
      const known = new Set(services.map((service) => service.id));
      const missing = requestedIds.filter((id) => !known.has(id));
      throw AppError.badRequest(`Unknown service id(s): ${missing.join(', ')}.`);
    }

    const serviceById = new Map(services.map((service) => [service.id, service]));
    const priorByService = new Map((existing?.lines ?? []).map((line) => [line.serviceId, line]));

    const resolved: Array<{
      serviceId: number;
      quantity: number;
      unitFee: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];

    for (const line of lines) {
      const prior = priorByService.get(line.serviceId);
      const keepFrozenFee = prior !== undefined && !reapplyPriceSchedule;
      const fee = keepFrozenFee
        ? prior.unitFee
        : await resolveFee(tx, clinicId, line.serviceId, date);

      if (fee === null) {
        const service = serviceById.get(line.serviceId);
        throw AppError.unprocessable(
          `No fee is configured for ${service?.nameEn ?? 'this service'} at ${clinic.name} on ${date}. Add a price covering this date under Settings then Pricing, and save again.`,
        );
      }

      resolved.push({
        serviceId: line.serviceId,
        quantity: line.quantity,
        unitFee: fee,
        lineTotal: lineTotal(line.quantity, fee),
      });
    }

    const activity = existing
      ? await tx.dailyActivity.update({
          where: { id: existing.id },
          data: { note: note ?? null, updatedBy: userId },
        })
      : await tx.dailyActivity.create({
          data: {
            clinicId,
            activityDate,
            note: note ?? null,
            createdBy: userId,
            updatedBy: userId,
          },
        });

    // Services omitted from the payload are removed from the day.
    const submitted = new Set(resolved.map((line) => line.serviceId));
    const removable = (existing?.lines ?? []).filter((line) => !submitted.has(line.serviceId));
    if (removable.length > 0) {
      await tx.dailyActivityLine.deleteMany({
        where: { id: { in: removable.map((line) => line.id) } },
      });
    }

    for (const line of resolved) {
      await tx.dailyActivityLine.upsert({
        where: { activityId_serviceId: { activityId: activity.id, serviceId: line.serviceId } },
        create: {
          activityId: activity.id,
          serviceId: line.serviceId,
          quantity: line.quantity,
          unitFee: line.unitFee,
          lineTotal: line.lineTotal,
        },
        update: {
          quantity: line.quantity,
          unitFee: line.unitFee,
          lineTotal: line.lineTotal,
        },
      });
    }

    // The header total is maintained by a database trigger over these lines, so it is
    // never written here and cannot disagree with the sum of what was just stored.
  });

  return getDailyEntryView(clinicId, date);
}

export async function deleteDaily(id: number): Promise<void> {
  const existing = await prisma.dailyActivity.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Daily record not found.');
  await prisma.dailyActivity.delete({ where: { id } });
}

/** Sum of a day's lines, computed independently of the database trigger. */
export function sumLines(lines: DailyLineDto[]): string {
  return toMoney(sumMoney(lines.map((line) => line.lineTotal)));
}
