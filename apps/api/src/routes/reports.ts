import { Router, type Response } from 'express';
import type {
  AnnualReportDto,
  ComparisonReportDto,
  ExportFormat,
  MonthlyReportDto,
} from '@clinic/shared';
import {
  annualQuerySchema,
  comparisonQuerySchema,
  dailyReportQuerySchema,
  dashboardQuerySchema,
  monthQuerySchema,
} from '@clinic/shared';
import { getQuery, validateQuery } from '../middleware/validate.js';
import {
  getAnnualReport,
  getComparisonReport,
  getDashboardSummary,
  getMonthlyReport,
} from '../services/reports.js';
import { getDailyEntryView } from '../services/daily.js';
import { moneyForExport, toCsv, toXlsx, type ExportSheet } from '../lib/export.js';
import { monthRange } from '../lib/date.js';

export const reportsRouter = Router();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

async function sendExport(
  res: Response,
  format: ExportFormat,
  sheet: ExportSheet,
  filenameBase: string,
): Promise<boolean> {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    res.send(toCsv(sheet));
    return true;
  }
  if (format === 'xlsx') {
    const buffer = await toXlsx(sheet);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    res.send(buffer);
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

reportsRouter.get('/dashboard', validateQuery(dashboardQuerySchema), async (_req, res) => {
  const { clinicId, year, month } = getQuery<{ clinicId: number; year: number; month: number }>(res);
  res.json(await getDashboardSummary(clinicId, year, month));
});

/* -------------------------------------------------------------------------- */
/* Daily report                                                                */
/* -------------------------------------------------------------------------- */

reportsRouter.get('/daily', validateQuery(dailyReportQuerySchema), async (_req, res) => {
  const { clinicId, date, format } = getQuery<{
    clinicId: number;
    date: string;
    format: ExportFormat;
  }>(res);
  const view = await getDailyEntryView(clinicId, date);

  const sheet: ExportSheet = {
    title: `${view.activity.clinicName} ${date}`,
    columns: [
      { header: 'Service', key: 'service', width: 24 },
      { header: 'Count', key: 'count', width: 10 },
      { header: 'Fee applied', key: 'fee', width: 14, numeric: true },
      { header: 'Income', key: 'income', width: 16, numeric: true },
    ],
    rows: view.activity.lines.map((line) => ({
      service: line.serviceNameEn,
      count: line.quantity,
      fee: moneyForExport(line.unitFee),
      income: moneyForExport(line.lineTotal),
    })),
    totals: {
      service: 'Total',
      count: view.activity.lines.reduce((sum, line) => sum + line.quantity, 0),
      fee: '',
      income: moneyForExport(view.activity.totalDailyIncome),
    },
  };

  const filename = `daily-${view.activity.clinicName}-${date}`.replace(/\s+/g, '-');
  if (await sendExport(res, format, sheet, filename)) return;
  res.json(view);
});

/* -------------------------------------------------------------------------- */
/* Monthly report                                                              */
/* -------------------------------------------------------------------------- */

function monthlySheet(report: MonthlyReportDto): ExportSheet {
  return {
    title: `${report.clinicName} ${monthName(report.month)} ${report.year}`,
    columns: [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Examinations', key: 'examinationCount', width: 14 },
      { header: 'Exam income', key: 'examinationIncome', width: 16, numeric: true },
      { header: 'Consultations', key: 'consultationCount', width: 14 },
      { header: 'Consultation income', key: 'consultationIncome', width: 20, numeric: true },
      { header: 'Daily total', key: 'total', width: 16, numeric: true },
    ],
    rows: report.rows.map((row) => ({
      date: row.date,
      examinationCount: row.examinationCount,
      examinationIncome: moneyForExport(row.examinationIncome),
      consultationCount: row.consultationCount,
      consultationIncome: moneyForExport(row.consultationIncome),
      total: moneyForExport(row.totalDailyIncome),
    })),
    totals: {
      date: 'Total',
      examinationCount: report.totals.examinationCount,
      examinationIncome: moneyForExport(report.totals.examinationIncome),
      consultationCount: report.totals.consultationCount,
      consultationIncome: moneyForExport(report.totals.consultationIncome),
      total: moneyForExport(report.totals.totalIncome),
    },
  };
}

reportsRouter.get('/monthly', validateQuery(monthQuerySchema), async (_req, res) => {
  const { clinicId, year, month, format } = getQuery<{
    clinicId: number;
    year: number;
    month: number;
    format: ExportFormat;
  }>(res);
  const report = await getMonthlyReport(clinicId, year, month);
  const filename = `monthly-${report.clinicName}-${year}-${String(month).padStart(2, '0')}`.replace(
    /\s+/g,
    '-',
  );
  if (await sendExport(res, format, monthlySheet(report), filename)) return;
  res.json(report);
});

/* -------------------------------------------------------------------------- */
/* Clinic comparison                                                           */
/* -------------------------------------------------------------------------- */

function comparisonSheet(report: ComparisonReportDto): ExportSheet {
  return {
    title: `Clinic comparison ${report.from} to ${report.to}`,
    columns: [
      { header: 'Clinic', key: 'clinic', width: 24 },
      { header: 'Examinations', key: 'examinations', width: 14 },
      { header: 'Consultations', key: 'consultations', width: 14 },
      { header: 'Total income', key: 'total', width: 18, numeric: true },
    ],
    rows: report.rows.map((row) => ({
      clinic: row.clinicName,
      examinations: row.examinationCount,
      consultations: row.consultationCount,
      total: moneyForExport(row.totalIncome),
    })),
    totals: {
      clinic: 'Total',
      examinations: report.totals.examinationCount,
      consultations: report.totals.consultationCount,
      total: moneyForExport(report.totals.totalIncome),
    },
  };
}

reportsRouter.get('/comparison', validateQuery(comparisonQuerySchema), async (_req, res) => {
  const query = getQuery<{
    year?: number;
    month?: number;
    from?: string;
    to?: string;
    format: ExportFormat;
  }>(res);

  // The schema guarantees one of the two forms is present.
  const range =
    query.from && query.to
      ? { from: query.from, to: query.to }
      : monthRange(query.year as number, query.month as number);

  const report = await getComparisonReport(range.from, range.to);
  const filename = `clinic-comparison-${range.from}-to-${range.to}`;
  if (await sendExport(res, query.format, comparisonSheet(report), filename)) return;
  res.json(report);
});

/* -------------------------------------------------------------------------- */
/* Annual report                                                               */
/* -------------------------------------------------------------------------- */

function annualSheet(report: AnnualReportDto): ExportSheet {
  const clinicColumns = report.clinics.map((clinic) => ({
    header: clinic.clinicName,
    key: `clinic_${clinic.clinicId}`,
    width: 16,
    numeric: true,
  }));

  return {
    title: `Annual income ${report.year}`,
    columns: [
      { header: 'Month', key: 'month', width: 14 },
      ...clinicColumns,
      { header: 'Total', key: 'total', width: 18, numeric: true },
    ],
    rows: report.rows.map((row) => {
      const record: Record<string, string | number> = {
        month: monthName(row.month),
        total: moneyForExport(row.total),
      };
      for (const clinic of report.clinics) {
        record[`clinic_${clinic.clinicId}`] = moneyForExport(
          row.byClinic[String(clinic.clinicId)] ?? '0.00',
        );
      }
      return record;
    }),
    totals: (() => {
      const record: Record<string, string | number> = {
        month: 'Total',
        total: moneyForExport(report.totals.total),
      };
      for (const clinic of report.clinics) {
        record[`clinic_${clinic.clinicId}`] = moneyForExport(
          report.totals.byClinic[String(clinic.clinicId)] ?? '0.00',
        );
      }
      return record;
    })(),
  };
}

reportsRouter.get('/annual', validateQuery(annualQuerySchema), async (_req, res) => {
  const { year, format } = getQuery<{ year: number; format: ExportFormat }>(res);
  const report = await getAnnualReport(year);
  if (await sendExport(res, format, annualSheet(report), `annual-income-${year}`)) return;
  res.json(report);
});
