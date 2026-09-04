import { Router, type Response } from 'express';
import type { AnnualReportDto, ExportFormat, MonthlyReportDto } from '@clinic/shared';
import {
  annualQuerySchema,
  dailyReportQuerySchema,
  dashboardQuerySchema,
  monthQuerySchema,
} from '@clinic/shared';
import { getQuery, validateQuery } from '../middleware/validate.js';
import { getAnnualReport, getDashboardSummary, getMonthlyReport } from '../services/reports.js';
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
  const serviceColumns = report.byService.map((service) => ({
    header: service.serviceNameEn,
    key: `service_${service.serviceId}`,
    width: 16,
    numeric: true,
  }));

  return {
    title: `${report.clinicName} ${monthName(report.month)} ${report.year}`,
    columns: [
      { header: 'Date', key: 'date', width: 14 },
      ...serviceColumns,
      { header: 'Daily total', key: 'total', width: 16, numeric: true },
    ],
    rows: report.rows.map((row) => {
      const record: Record<string, string | number> = {
        date: row.date,
        total: moneyForExport(row.totalDailyIncome),
      };
      for (const service of report.byService) {
        const line = row.lines.find((item) => item.serviceId === service.serviceId);
        record[`service_${service.serviceId}`] = moneyForExport(line?.lineTotal ?? '0.00');
      }
      return record;
    }),
    totals: (() => {
      const record: Record<string, string | number> = {
        date: 'Total',
        total: moneyForExport(report.totals.totalIncome),
      };
      for (const service of report.byService) {
        record[`service_${service.serviceId}`] = moneyForExport(service.income);
      }
      return record;
    })(),
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
/* Annual report                                                               */
/* -------------------------------------------------------------------------- */

function annualSheet(report: AnnualReportDto): ExportSheet {
  const serviceColumns = report.services.map((service) => ({
    header: service.serviceNameEn,
    key: `service_${service.serviceId}`,
    width: 16,
    numeric: true,
  }));

  return {
    title: `${report.clinicName} annual income ${report.year}`,
    columns: [
      { header: 'Month', key: 'month', width: 14 },
      ...serviceColumns,
      { header: 'Total', key: 'total', width: 18, numeric: true },
    ],
    rows: report.rows.map((row) => {
      const record: Record<string, string | number> = {
        month: monthName(row.month),
        total: moneyForExport(row.total),
      };
      for (const service of report.services) {
        record[`service_${service.serviceId}`] = moneyForExport(
          row.byService[String(service.serviceId)] ?? '0.00',
        );
      }
      return record;
    }),
    totals: (() => {
      const record: Record<string, string | number> = {
        month: 'Total',
        total: moneyForExport(report.totals.total),
      };
      for (const service of report.services) {
        record[`service_${service.serviceId}`] = moneyForExport(
          report.totals.byService[String(service.serviceId)] ?? '0.00',
        );
      }
      return record;
    })(),
  };
}

reportsRouter.get('/annual', validateQuery(annualQuerySchema), async (_req, res) => {
  const { clinicId, year, format } = getQuery<{
    clinicId: number;
    year: number;
    format: ExportFormat;
  }>(res);
  const report = await getAnnualReport(clinicId, year);
  if (await sendExport(res, format, annualSheet(report), `annual-income-${year}`)) return;
  res.json(report);
});
