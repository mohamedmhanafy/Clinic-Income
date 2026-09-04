import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../lib/app-state';
import { useAnnual, useDailyEntry, useMonthly } from '../lib/queries';
import { ApiError } from '../lib/api';
import {
  firstOfMonth,
  formatCount,
  formatFullDate,
  formatMoney,
  lastOfMonth,
  monthName,
  todayIso,
} from '../lib/format';
import { Card, EmptyState, ErrorNotice, Field, Input, SectionTitle, Spinner } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ExportBar } from '../components/ExportBar';
import { ChevronIcon } from '../components/icons';
import { DatePicker } from '../components/DatePicker';

/**
 * Reports.
 *
 * Four report types behind a scrollable tab strip rather than a desktop tab row, so the
 * whole set stays reachable with a thumb on a narrow screen. Each tab exports to CSV and
 * Excel, and prints to PDF through the browser.
 */

type Tab = 'daily' | 'monthly' | 'annual';

function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  // Period reports ascend by scope (day, month, year).
  const tabs: Tab[] = ['daily', 'monthly', 'annual'];

  return (
    <div className="no-print -mx-4 overflow-x-auto px-4">
      <div role="tablist" className="flex w-max min-w-full gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={value === tab}
            onClick={() => onChange(tab)}
            className={[
              'tap shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors',
              value === tab
                ? 'bg-brand-600 text-white'
                : 'border border-line bg-white text-muted',
            ].join(' ')}
          >
            {t(`reports.${tab}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two-column "label / value" row, the shape almost every report card reduces to. */
function StatRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className={`text-sm ${strong ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</span>
      <span className={`tabnum text-sm ${strong ? 'font-bold text-ink' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function DailyReport() {
  const { t } = useTranslation();
  const { clinicId, language } = useAppState();
  const [date, setDate] = useState(todayIso);
  const entry = useDailyEntry(clinicId, date);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Field label={t('common.date')} htmlFor="report-date">
            <Input
              id="report-date"
              type="date"
              value={date}
              onChange={(event) => event.target.value && setDate(event.target.value)}
            />
          </Field>
        </div>
        {clinicId !== null && <ExportBar report="daily" params={{ clinicId, date }} />}
      </div>

      {entry.isPending && <Spinner />}
      {entry.data && (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">{entry.data.activity.clinicName}</p>
            <p className="text-sm text-muted">{formatFullDate(date, language)}</p>
          </div>

          {entry.data.activity.lines.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-center text-sm text-muted">{t('monthly.noRecords')}</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-line">
                {entry.data.activity.lines.map((line) => (
                  <div key={line.serviceId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {language === 'ar' ? line.serviceNameAr : line.serviceNameEn}
                      </span>
                      <span className="tabnum text-sm font-semibold text-ink">
                        {formatMoney(line.lineTotal)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatCount(line.quantity)} × {formatMoney(line.unitFee)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-line bg-canvas">
                <StatRow
                  label={t('daily.dailyTotal')}
                  value={formatMoney(entry.data.activity.totalDailyIncome)}
                  strong
                />
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function MonthlyReport() {
  const { t } = useTranslation();
  const { clinicId, year, month } = useAppState();
  const report = useMonthly(clinicId, year, month);

  return (
    <div className="flex flex-col gap-4">
      <PeriodBar />
      {clinicId !== null && <ExportBar report="monthly" params={{ clinicId, year, month }} />}

      {report.isPending && <Spinner />}
      {report.data && (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">{report.data.clinicName}</p>
          </div>
          <div className="divide-y divide-line">
            <StatRow
              label={t('dashboard.examinations')}
              value={formatCount(report.data.totals.examinationCount)}
            />
            <StatRow
              label={t('monthly.examIncome')}
              value={formatMoney(report.data.totals.examinationIncome)}
            />
            <StatRow
              label={t('dashboard.consultations')}
              value={formatCount(report.data.totals.consultationCount)}
            />
            <StatRow
              label={t('monthly.consultIncome')}
              value={formatMoney(report.data.totals.consultationIncome)}
            />
            <StatRow
              label={t('dashboard.workingDays')}
              value={formatCount(report.data.totals.workingDays)}
            />
          </div>
          <div className="border-t-2 border-line bg-canvas">
            <StatRow
              label={t('monthly.monthTotal')}
              value={formatMoney(report.data.totals.totalIncome)}
              strong
            />
          </div>
        </Card>
      )}
    </div>
  );
}


function AnnualReport() {
  const { t } = useTranslation();
  const { year, setPeriod, month, language } = useAppState();
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const report = useAnnual(year);

  const years = Array.from({ length: 9 }, (_, index) => new Date().getFullYear() - 4 + index);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-32">
          <Field label={t('common.year')} htmlFor="annual-year">
            <select
              id="annual-year"
              value={year}
              onChange={(event) => setPeriod(Number(event.target.value), month)}
              className="tap w-full rounded-xl border border-line bg-white px-3 py-3 text-ink focus:outline-none"
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ExportBar report="annual" params={{ year }} />
      </div>

      {report.isPending && <Spinner />}

      {report.data && report.data.clinics.length === 0 && (
        <EmptyState title={t('common.noData')} />
      )}

      {report.data && report.data.clinics.length > 0 && (
        <>
          {/* Phone: a month list that expands to per-clinic figures, instead of a matrix
              that would be as wide as the clinic count. */}
          <ul className="print-cards flex flex-col gap-2 lg:hidden">
            {report.data.rows.map((row) => {
              const isOpen = openMonth === row.month;
              return (
                <li key={row.month}>
                  <Card className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenMonth(isOpen ? null : row.month)}
                      aria-expanded={isOpen}
                      className="tap flex w-full items-center gap-3 px-4 py-3 text-start"
                    >
                      <span className="flex-1 text-sm font-semibold text-ink">
                        {monthName(row.month, language)}
                      </span>
                      <span className="tabnum text-sm font-bold text-ink">
                        {formatMoney(row.total)}
                      </span>
                      <ChevronIcon
                        className={`h-5 w-5 shrink-0 text-muted transition-transform rtl:rotate-180 ${
                          isOpen ? 'rotate-90 rtl:-rotate-90' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-line border-t border-line bg-canvas/60">
                        {report.data.clinics.map((clinic) => (
                          <StatRow
                            key={clinic.clinicId}
                            label={clinic.clinicName}
                            value={formatMoney(row.byClinic[String(clinic.clinicId)] ?? '0.00')}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
            <li>
              <Card className="bg-brand-50">
                <StatRow
                  label={t('reports.grandTotal')}
                  value={formatMoney(report.data.totals.total)}
                  strong
                />
              </Card>
            </li>
          </ul>

          <Card className="hidden overflow-x-auto lg:block">
            <table className="print-table w-full text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('common.month')}</th>
                  {report.data.clinics.map((clinic) => (
                    <th key={clinic.clinicId} className="px-4 py-3 text-end font-semibold">
                      {clinic.clinicName}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-end font-semibold">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.data.rows.map((row) => (
                  <tr key={row.month}>
                    <td className="px-4 py-2.5 text-ink">{monthName(row.month, language)}</td>
                    {report.data.clinics.map((clinic) => (
                      <td key={clinic.clinicId} className="tabnum px-4 py-2.5 text-end">
                        {formatMoney(row.byClinic[String(clinic.clinicId)] ?? '0.00')}
                      </td>
                    ))}
                    <td className="tabnum px-4 py-2.5 text-end font-semibold">
                      {formatMoney(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas font-bold">
                <tr>
                  <td className="px-4 py-3">{t('common.total')}</td>
                  {report.data.clinics.map((clinic) => (
                    <td key={clinic.clinicId} className="tabnum px-4 py-3 text-end">
                      {formatMoney(report.data.totals.byClinic[String(clinic.clinicId)] ?? '0.00')}
                    </td>
                  ))}
                  <td className="tabnum px-4 py-3 text-end">
                    {formatMoney(report.data.totals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('monthly');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">{t('reports.title')}</h1>
      <Tabs value={tab} onChange={setTab} />

      <SectionTitle>{t(`reports.${tab}`)}</SectionTitle>

      {tab === 'daily' && <DailyReport />}
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'annual' && <AnnualReport />}
    </div>
  );
}
