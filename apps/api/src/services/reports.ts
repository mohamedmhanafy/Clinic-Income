import type {
  AnnualReportDto,
  ComparisonReportDto,
  ComparisonRowDto,
  DashboardSummaryDto,
  MonthlyReportDto,
  MonthlyReportRowDto,
} from '@clinic/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { fromDbDate, monthRange, toDbDate, yearRange } from '../lib/date.js';
import { sumMoney, toMoney } from '../lib/money.js';
import { AppError } from '../lib/errors.js';
import { toLineDto } from './daily.js';

/**
 * Reporting.
 *
 * Every aggregate is computed by the database with SUM/GROUP BY rather than by adding
 * values up in JavaScript. That keeps the arithmetic in exact NUMERIC, and keeps the
 * reported totals derived from the stored rows rather than recomputed from current prices.
 *
 * Date parameters are passed as YYYY-MM-DD strings and cast with ::date in SQL. Passing a
 * JS Date would send a timestamp whose conversion to date depends on the session timezone,
 * which is exactly the class of bug that shifts a day's income onto the wrong day.
 */

const EXAMINATION_CODE = 'EXAMINATION';
const CONSULTATION_CODE = 'CONSULTATION';

interface ServiceTotalRow {
  service_id: number;
  code: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  quantity: number;
  income: Prisma.Decimal;
}

/** Per-service totals for one clinic over an inclusive date range. */
async function serviceTotals(
  clinicId: number,
  from: string,
  to: string,
): Promise<ServiceTotalRow[]> {
  // Every service is listed even when it has no activity in the period, so a report never
  // silently omits a service that simply had a quiet month.
  return prisma.$queryRaw<ServiceTotalRow[]>`
    SELECT s.id                                AS service_id,
           s.code                              AS code,
           s.name_en                           AS name_en,
           s.name_ar                           AS name_ar,
           s.sort_order                        AS sort_order,
           COALESCE(SUM(pl.quantity), 0)::int  AS quantity,
           COALESCE(SUM(pl.line_total), 0)     AS income
      FROM services s
      LEFT JOIN (
             SELECT l.service_id, l.quantity, l.line_total
               FROM daily_activity_lines l
               JOIN daily_activities a ON a.id = l.activity_id
              WHERE a.clinic_id = ${clinicId}
                AND a.activity_date BETWEEN ${from}::date AND ${to}::date
           ) pl ON pl.service_id = s.id
     WHERE s.clinic_id = ${clinicId}
     GROUP BY s.id, s.code, s.name_en, s.name_ar, s.sort_order
     ORDER BY s.sort_order, s.id
  `;
}

/**
 * Working days: dates on which the clinic actually recorded activity. A day saved with all
 * counts at zero (clinic closed) is stored but does not count as a working day.
 */
async function countWorkingDays(clinicId: number, from: string, to: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ working_days: number }>>`
    SELECT COUNT(*)::int AS working_days
      FROM (
        SELECT a.id
          FROM daily_activities a
          JOIN daily_activity_lines l ON l.activity_id = a.id
         WHERE a.clinic_id = ${clinicId}
           AND a.activity_date BETWEEN ${from}::date AND ${to}::date
         GROUP BY a.id
        HAVING SUM(l.quantity) > 0
      ) active_days
  `;
  return rows[0]?.working_days ?? 0;
}

async function totalIncome(clinicId: number, from: string, to: string): Promise<Prisma.Decimal> {
  const rows = await prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>`
    SELECT COALESCE(SUM(a.total_income), 0) AS total
      FROM daily_activities a
     WHERE a.clinic_id = ${clinicId}
       AND a.activity_date BETWEEN ${from}::date AND ${to}::date
  `;
  return rows[0]?.total ?? new Prisma.Decimal(0);
}

async function requireClinic(clinicId: number) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) throw AppError.notFound('Clinic not found.');
  return clinic;
}

function pickByCode(rows: ServiceTotalRow[], code: string) {
  return rows.find((row) => row.code === code);
}

export async function getDashboardSummary(
  clinicId: number,
  year: number,
  month: number,
): Promise<DashboardSummaryDto> {
  const clinic = await requireClinic(clinicId);
  const { from, to } = monthRange(year, month);

  const [totals, workingDays, total] = await Promise.all([
    serviceTotals(clinicId, from, to),
    countWorkingDays(clinicId, from, to),
    totalIncome(clinicId, from, to),
  ]);

  const examination = pickByCode(totals, EXAMINATION_CODE);
  const consultation = pickByCode(totals, CONSULTATION_CODE);

  return {
    clinicId,
    clinicName: clinic.name,
    year,
    month,
    totalIncome: toMoney(total),
    examinationIncome: toMoney(examination?.income ?? 0),
    consultationIncome: toMoney(consultation?.income ?? 0),
    examinationCount: examination?.quantity ?? 0,
    consultationCount: consultation?.quantity ?? 0,
    workingDays,
    byService: totals.map((row) => ({
      serviceId: row.service_id,
      serviceCode: row.code,
      serviceNameEn: row.name_en,
      serviceNameAr: row.name_ar,
      quantity: row.quantity,
      income: toMoney(row.income),
    })),
  };
}

export async function getMonthlyReport(
  clinicId: number,
  year: number,
  month: number,
): Promise<MonthlyReportDto> {
  const clinic = await requireClinic(clinicId);
  const { from, to } = monthRange(year, month);

  const [activities, totals, workingDays, total] = await Promise.all([
    prisma.dailyActivity.findMany({
      where: {
        clinicId,
        activityDate: { gte: toDbDate(from), lte: toDbDate(to) },
      },
      include: { lines: { include: { service: true } } },
      orderBy: { activityDate: 'asc' },
    }),
    serviceTotals(clinicId, from, to),
    countWorkingDays(clinicId, from, to),
    totalIncome(clinicId, from, to),
  ]);

  const rows: MonthlyReportRowDto[] = activities.map((activity) => {
    const lines = activity.lines
      .map(toLineDto)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.serviceId - b.serviceId);
    const examination = lines.find((line) => line.serviceCode === EXAMINATION_CODE);
    const consultation = lines.find((line) => line.serviceCode === CONSULTATION_CODE);
    const date = fromDbDate(activity.activityDate);
    return {
      date,
      dayOfMonth: Number(date.slice(8, 10)),
      examinationCount: examination?.quantity ?? 0,
      examinationIncome: examination?.lineTotal ?? '0.00',
      consultationCount: consultation?.quantity ?? 0,
      consultationIncome: consultation?.lineTotal ?? '0.00',
      totalDailyIncome: toMoney(activity.totalIncome),
      lines,
    };
  });

  const examinationTotal = pickByCode(totals, EXAMINATION_CODE);
  const consultationTotal = pickByCode(totals, CONSULTATION_CODE);

  return {
    clinicId,
    clinicName: clinic.name,
    year,
    month,
    rows,
    totals: {
      examinationCount: examinationTotal?.quantity ?? 0,
      examinationIncome: toMoney(examinationTotal?.income ?? 0),
      consultationCount: consultationTotal?.quantity ?? 0,
      consultationIncome: toMoney(consultationTotal?.income ?? 0),
      totalIncome: toMoney(total),
      workingDays,
    },
  };
}

interface ComparisonRawRow {
  clinic_id: number;
  clinic_name: string;
  code: string | null;
  quantity: number;
  income: Prisma.Decimal;
}

export async function getComparisonReport(from: string, to: string): Promise<ComparisonReportDto> {
  const raw = await prisma.$queryRaw<ComparisonRawRow[]>`
    SELECT c.id                              AS clinic_id,
           c.name                            AS clinic_name,
           s.code                            AS code,
           COALESCE(SUM(l.quantity), 0)::int AS quantity,
           COALESCE(SUM(l.line_total), 0)    AS income
      FROM clinics c
      LEFT JOIN daily_activities a
             ON a.clinic_id = c.id
            AND a.activity_date BETWEEN ${from}::date AND ${to}::date
      LEFT JOIN daily_activity_lines l ON l.activity_id = a.id
      LEFT JOIN services s             ON s.id = l.service_id
     WHERE c.status = 'ACTIVE'
     GROUP BY c.id, c.name, s.code
     ORDER BY c.name
  `;

  const byClinic = new Map<number, ComparisonRowDto>();
  for (const row of raw) {
    let entry = byClinic.get(row.clinic_id);
    if (!entry) {
      entry = {
        clinicId: row.clinic_id,
        clinicName: row.clinic_name,
        examinationCount: 0,
        consultationCount: 0,
        totalIncome: '0.00',
      };
      byClinic.set(row.clinic_id, entry);
    }
    if (row.code === EXAMINATION_CODE) entry.examinationCount = row.quantity;
    if (row.code === CONSULTATION_CODE) entry.consultationCount = row.quantity;
    if (row.code !== null) {
      entry.totalIncome = toMoney(sumMoney([entry.totalIncome, row.income]));
    }
  }

  const rows = [...byClinic.values()].sort((a, b) => a.clinicName.localeCompare(b.clinicName));

  return {
    from,
    to,
    rows,
    totals: {
      examinationCount: rows.reduce((sum, row) => sum + row.examinationCount, 0),
      consultationCount: rows.reduce((sum, row) => sum + row.consultationCount, 0),
      totalIncome: toMoney(sumMoney(rows.map((row) => row.totalIncome))),
    },
  };
}

interface AnnualRawRow {
  clinic_id: number;
  month: number;
  income: Prisma.Decimal;
}

export async function getAnnualReport(year: number): Promise<AnnualReportDto> {
  const { from, to } = yearRange(year);

  const [clinics, raw] = await Promise.all([
    prisma.clinic.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    prisma.$queryRaw<AnnualRawRow[]>`
      SELECT a.clinic_id                                AS clinic_id,
             EXTRACT(MONTH FROM a.activity_date)::int   AS month,
             COALESCE(SUM(a.total_income), 0)           AS income
        FROM daily_activities a
       WHERE a.activity_date BETWEEN ${from}::date AND ${to}::date
       GROUP BY a.clinic_id, month
       ORDER BY month
    `,
  ]);

  const lookup = new Map<string, Prisma.Decimal>();
  for (const row of raw) {
    lookup.set(`${row.month}:${row.clinic_id}`, row.income);
  }

  const clinicTotals = new Map<number, Prisma.Decimal>();
  const rows = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const byClinicEntries: Record<string, string> = {};
    let monthTotal = new Prisma.Decimal(0);

    for (const clinic of clinics) {
      const income = lookup.get(`${month}:${clinic.id}`) ?? new Prisma.Decimal(0);
      byClinicEntries[String(clinic.id)] = toMoney(income);
      monthTotal = monthTotal.plus(income);
      clinicTotals.set(clinic.id, (clinicTotals.get(clinic.id) ?? new Prisma.Decimal(0)).plus(income));
    }

    return { month, byClinic: byClinicEntries, total: toMoney(monthTotal) };
  });

  const totalsByClinic: Record<string, string> = {};
  let grandTotal = new Prisma.Decimal(0);
  for (const clinic of clinics) {
    const value = clinicTotals.get(clinic.id) ?? new Prisma.Decimal(0);
    totalsByClinic[String(clinic.id)] = toMoney(value);
    grandTotal = grandTotal.plus(value);
  }

  return {
    year,
    clinics: clinics.map((clinic) => ({ clinicId: clinic.id, clinicName: clinic.name })),
    rows,
    totals: { byClinic: totalsByClinic, total: toMoney(grandTotal) },
  };
}
