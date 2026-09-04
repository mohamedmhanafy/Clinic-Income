import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import { useAnnual, useDailyEntry, useMonthly } from '../lib/queries';
import { ApiError } from '../lib/api';
import {
  firstOfMonth,
  formatCount,
  formatDayLabel,
  formatFullDate,
  lastOfMonth,
  monthName,
  monthNameShort,
  serviceName,
  todayIso,
} from '../lib/format';
import {
  Card,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Money,
  SectionTitle,
  Select,
  Spinner,
} from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ExportBar } from '../components/ExportBar';
import { ChevronIcon } from '../components/icons';
import { DatePicker } from '../components/DatePicker';
import { CompositionChart, DailyTrendChart, MonthlyTrendChart } from '../components/charts';

/**
 * Reports.
 *
 * Three report types behind a scrollable tab strip rather than a desktop tab row, so the
 * whole set stays reachable with a thumb on a narrow screen. Each tab exports to Excel and
 * prints to PDF through the browser.
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
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className={strong ? 'text-base font-semibold text-ink' : 'text-sm text-muted'}>
        {label}
      </span>
      <span className={`tabnum ${strong ? 'text-xl font-bold text-ink' : 'text-sm text-ink'}`}>
        {value}
      </span>
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
      <div className="flex items-center justify-between gap-3">
        <div className="no-print w-40 shrink-0">
          <DatePicker
            id="report-date"
            value={date}
            onChange={(value) => value && setDate(value)}
          />
        </div>
        <ExportBar />
      </div>

      {entry.isPending && <Spinner />}

      {/* The date picker is hidden on the printed page, so this header carries that context
          onto paper - otherwise a printed report doesn't say which day it's for. */}
      {entry.data && (
        <div className="px-1">
          <p className="text-lg font-semibold text-ink">{entry.data.activity.clinicName}</p>
          <p className="text-sm text-muted">{formatFullDate(date, language)}</p>
        </div>
      )}

      {entry.data && entry.data.activity.lines.length === 0 && (
        <EmptyState
          title={t('monthly.noRecords')}
          hint={t('dashboard.emptyHint')}
          action={
            <Link
              to="/daily"
              className="tap mt-1 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
            >
              {t('dashboard.recordDay')}
            </Link>
          }
        />
      )}

      {entry.data && entry.data.activity.lines.length > 0 && (
        <>
          <Card className="bg-brand-50 no-print">
            <StatRow
              label={t('daily.dailyTotal')}
              value={<Money value={entry.data.activity.totalDailyIncome} />}
              strong
            />
          </Card>

          {/* Screen: a compact list. print:hidden because a `hidden` ancestor would hide its
              contents on paper too regardless of screen width, so print visibility has to be
              set on this same element. */}
          <Card className="print:hidden">
            <ul className="divide-y divide-line">
              {entry.data.activity.lines.map((line) => (
                <li key={line.serviceId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">
                      {language === 'ar' ? line.serviceNameAr : line.serviceNameEn}
                    </span>
                    <span className="tabnum text-sm font-semibold text-ink">
                      <Money value={line.lineTotal} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatCount(line.quantity)} × <Money value={line.unitFee} />
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Printed page: a table with a totals row, same shape as the monthly/annual reports. */}
          <Card className="hidden overflow-x-auto print:block">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('common.service')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('common.count')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('common.fee')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entry.data.activity.lines.map((line) => (
                  <tr key={line.serviceId}>
                    <td className="px-4 py-2.5 text-ink">
                      {language === 'ar' ? line.serviceNameAr : line.serviceNameEn}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end">{formatCount(line.quantity)}</td>
                    <td className="tabnum px-4 py-2.5 text-end">
                      <Money value={line.unitFee} />
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end font-semibold">
                      <Money value={line.lineTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>
                    {t('common.total')}
                  </td>
                  <td className="tabnum px-4 py-3 text-end">
                    <Money value={entry.data.activity.totalDailyIncome} />
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

/**
 * One point per calendar day of the report's month, not just the days with a saved entry -
 * a day nobody recorded is real information (nothing happened), not a gap to skip over.
 */
function fillMonthDays(report: {
  year: number;
  month: number;
  rows: Array<{ dayOfMonth: number; totalDailyIncome: string }>;
}): Array<{ day: number; income: string }> {
  const byDay = new Map(report.rows.map((row) => [row.dayOfMonth, row.totalDailyIncome]));
  const daysInMonth = new Date(report.year, report.month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return { day, income: byDay.get(day) ?? '0.00' };
  });
}

function MonthlyReport() {
  const { t } = useTranslation();
  const { clinicId, year, month, language } = useAppState();
  const report = useMonthly(clinicId, year, month);
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (date: string) => setExpanded((current) => (current === date ? null : date));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PeriodBar />
        <ExportBar />
      </div>

      {report.isPending && <Spinner />}

      {/* PeriodBar (month/year) is hidden on the printed page, so this header carries that
          context onto paper - otherwise a printed report doesn't say which month it's for. */}
      {report.data && (
        <div className="px-1">
          <p className="text-lg font-semibold text-ink">{report.data.clinicName}</p>
          <p className="text-sm text-muted">
            {monthName(report.data.month, language)} {report.data.year}
          </p>
        </div>
      )}

      {report.data && report.data.rows.length === 0 && (
        <EmptyState
          title={t('monthly.noRecords')}
          hint={t('dashboard.emptyHint')}
          action={
            <Link
              to="/daily"
              className="tap mt-1 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
            >
              {t('dashboard.recordDay')}
            </Link>
          }
        />
      )}

      {report.data && report.data.rows.length > 0 && (
        <>
          <Card className="bg-brand-50 no-print">
            <StatRow
              label={t('monthly.monthTotal')}
              value={<Money value={report.data.totals.totalIncome} />}
              strong
            />
            <StatRow
              label={t('dashboard.workingDays')}
              value={formatCount(report.data.totals.workingDays)}
            />
          </Card>

          {/* Phone: expandable cards, one per day. print:hidden (not just lg:hidden) because
              a `hidden` ancestor hides its contents on the printed page too, regardless of
              screen width, so print visibility has to be set on this same element. */}
          <ul className="flex flex-col gap-2 lg:hidden print:hidden">
            {report.data.rows.map((row) => {
              const isOpen = expanded === row.date;
              return (
                <li key={row.date}>
                  <Card className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggle(row.date)}
                      aria-expanded={isOpen}
                      className="tap flex w-full items-center gap-3 p-3.5 text-start"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {formatDayLabel(row.date, language)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {row.lines
                            .filter((line) => line.quantity > 0)
                            .map(
                              (line) =>
                                `${formatCount(line.quantity)} ${
                                  language === 'ar' ? line.serviceNameAr : line.serviceNameEn
                                }`,
                            )
                            .join(' · ') || t('common.none')}
                        </span>
                      </span>

                      <span className="tabnum text-base font-bold text-ink">
                        {<Money value={row.totalDailyIncome} />}
                      </span>

                      <ChevronIcon
                        className={`h-5 w-5 shrink-0 text-muted transition-transform rtl:rotate-180 ${
                          isOpen ? 'rotate-90 rtl:-rotate-90' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-line bg-canvas/60 px-3.5 py-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted">
                              <th className="pb-1 text-start font-medium">{t('common.service')}</th>
                              <th className="pb-1 text-end font-medium">{t('common.count')}</th>
                              <th className="pb-1 text-end font-medium">{t('common.fee')}</th>
                              <th className="pb-1 text-end font-medium">{t('common.income')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.lines.map((line) => (
                              <tr key={line.serviceId}>
                                <td className="py-1 text-ink">
                                  {language === 'ar' ? line.serviceNameAr : line.serviceNameEn}
                                </td>
                                <td className="tabnum py-1 text-end text-ink">
                                  {formatCount(line.quantity)}
                                </td>
                                <td className="tabnum py-1 text-end text-muted">
                                  {<Money value={line.unitFee} />}
                                </td>
                                <td className="tabnum py-1 text-end font-semibold text-ink">
                                  {<Money value={line.lineTotal} />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          {/* Tablet and desktop: the full table, one column per real service (whatever is
              configured in Settings), not a fixed examination/consultation pair - same
              date-rows/service-columns shape as the annual report table. Always shown on the
              printed page. */}
          <Card className="hidden overflow-x-auto lg:block print:block">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('common.date')}</th>
                  {report.data.byService.map((service) => (
                    <th key={service.serviceId} className="px-4 py-3 text-end font-semibold">
                      {language === 'ar' ? service.serviceNameAr : service.serviceNameEn}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-end font-semibold">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.data.rows.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-2.5 text-ink">{formatDayLabel(row.date, language)}</td>
                    {report.data.byService.map((service) => {
                      const line = row.lines.find((item) => item.serviceId === service.serviceId);
                      return (
                        <td key={service.serviceId} className="tabnum px-4 py-2.5 text-end">
                          <span className="inline-flex items-baseline gap-1.5 justify-end">
                            {line && line.quantity > 0 && (
                              <span className="text-xs font-normal text-muted">
                                ({formatCount(line.quantity)})
                              </span>
                            )}
                            <Money value={line?.lineTotal ?? '0'} />
                          </span>
                        </td>
                      );
                    })}
                    <td className="tabnum px-4 py-2.5 text-end font-semibold">
                      {<Money value={row.totalDailyIncome} />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas font-bold">
                <tr>
                  <td className="px-4 py-3">{t('common.total')}</td>
                  {report.data.byService.map((service) => (
                    <td key={service.serviceId} className="tabnum px-4 py-3 text-end">
                      <Money value={service.income} />
                    </td>
                  ))}
                  <td className="tabnum px-4 py-3 text-end">
                    {<Money value={report.data.totals.totalIncome} />}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <section className="no-print">
            <SectionTitle>{t('dashboard.dailyTrend')}</SectionTitle>
            <Card className="p-3">
              <DailyTrendChart data={fillMonthDays(report.data)} />
            </Card>
          </section>

          {Number(report.data.totals.totalIncome) > 0 && (
            <section className="no-print">
              <SectionTitle>{t('dashboard.composition')}</SectionTitle>
              <Card className="p-4">
                <CompositionChart
                  services={report.data.byService.map((row) => ({
                    name: language === 'ar' ? row.serviceNameAr : row.serviceNameEn,
                    income: row.income,
                  }))}
                />
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}


function AnnualReport() {
  const { t } = useTranslation();
  const { clinicId, year, setPeriod, month, language } = useAppState();
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const report = useAnnual(clinicId, year);

  // 3 years back, 10 years ahead, ascending (oldest first).
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 14 }, (_, index) => currentYear - 3 + index);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="no-print w-32">
          <Field label={t('common.year')} htmlFor="annual-year">
            <Select
              id="annual-year"
              value={year}
              onChange={(event) => setPeriod(Number(event.target.value), month)}
              className="h-11"
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ExportBar />
      </div>

      {report.isPending && <Spinner />}

      {/* PeriodBar has no year selector shown here on the printed page, so this header
          carries the clinic and year onto paper. */}
      {report.data && (
        <div className="px-1">
          <p className="text-lg font-semibold text-ink">{report.data.clinicName}</p>
          <p className="text-sm text-muted">{report.data.year}</p>
        </div>
      )}

      {report.data && report.data.rows.some((row) => Number(row.total) > 0) && (
        <section className="no-print">
          <SectionTitle>{t('dashboard.monthlyTrend')}</SectionTitle>
          <Card className="p-3">
            <MonthlyTrendChart
              data={report.data.rows.map((row) => ({
                label: monthNameShort(row.month, language),
                income: row.total,
              }))}
            />
          </Card>
        </section>
      )}

      {report.data && report.data.services.length === 0 && (
        <EmptyState title={t('common.noData')} />
      )}

      {report.data && report.data.services.length > 0 && (
        <>
          {/* Phone: one row per month with an arrow that opens its service breakdown, rather
              than a table with as many columns as services - that never fits a phone width
              without scrolling. print:hidden/print:block (not the responsive lg: classes
              alone) because a `hidden` ancestor hides its contents on paper too regardless of
              screen width, so the print variant has to override display on this same element. */}
          <ul className="flex flex-col gap-2 lg:hidden print:hidden">
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
                        {<Money value={row.total} />}
                      </span>
                      <ChevronIcon
                        className={`h-5 w-5 shrink-0 text-muted transition-transform rtl:rotate-180 ${
                          isOpen ? 'rotate-90 rtl:-rotate-90' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-line border-t border-line bg-canvas/60">
                        {report.data.services.map((service) => (
                          <StatRow
                            key={service.serviceId}
                            label={serviceName(service, language)}
                            value={<Money value={row.byService[String(service.serviceId)] ?? '0.00'} />}
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
                  value={<Money value={report.data.totals.total} />}
                  strong
                />
              </Card>
            </li>
          </ul>

          <Card className="hidden overflow-x-auto lg:block print:block">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('common.month')}</th>
                  {report.data.services.map((service) => (
                    <th key={service.serviceId} className="px-4 py-3 text-end font-semibold">
                      {serviceName(service, language)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-end font-semibold">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.data.rows.map((row) => (
                  <tr key={row.month}>
                    <td className="px-4 py-2.5 text-ink">{monthName(row.month, language)}</td>
                    {report.data.services.map((service) => (
                      <td key={service.serviceId} className="tabnum px-4 py-2.5 text-end">
                        {<Money value={row.byService[String(service.serviceId)] ?? '0.00'} />}
                      </td>
                    ))}
                    <td className="tabnum px-4 py-2.5 text-end font-semibold">
                      {<Money value={row.total} />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas font-bold">
                <tr>
                  <td className="px-4 py-3">{t('common.total')}</td>
                  {report.data.services.map((service) => (
                    <td key={service.serviceId} className="tabnum px-4 py-3 text-end">
                      {<Money value={report.data.totals.byService[String(service.serviceId)] ?? '0.00'} />}
                    </td>
                  ))}
                  <td className="tabnum px-4 py-3 text-end">
                    {<Money value={report.data.totals.total} />}
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
