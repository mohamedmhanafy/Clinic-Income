import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import { useMonthly } from '../lib/queries';
import { ApiError } from '../lib/api';
import { formatCount, formatDayLabel, formatMoney } from '../lib/format';
import { Card, EmptyState, ErrorNotice, Spinner } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ExportBar } from '../components/ExportBar';
import { ChevronIcon } from '../components/icons';

/**
 * Monthly income.
 *
 * The specification's six-column table is unusable on a 390px screen, so the same data is
 * rendered two ways from one source: an expandable card list on phones and the real table
 * from `lg` upwards. Neither ever scrolls sideways.
 *
 * The month total sits in a bar that stays pinned while the list scrolls, so the figure
 * most people came for is never a scroll away.
 */
export default function Monthly() {
  const { t } = useTranslation();
  const { clinicId, year, month, language } = useAppState();
  const [expanded, setExpanded] = useState<string | null>(null);

  const report = useMonthly(clinicId, year, month);

  const toggle = (date: string) => setExpanded((current) => (current === date ? null : date));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('monthly.title')}</h1>
          {report.data && <p className="text-sm text-muted">{report.data.clinicName}</p>}
        </div>
        {clinicId !== null && (
          <ExportBar report="monthly" params={{ clinicId, year, month }} />
        )}
      </div>

      <PeriodBar />

      {report.isPending && <Spinner />}
      {report.isError && (
        <ErrorNotice
          message={
            report.error instanceof ApiError ? report.error.message : t('common.somethingWrong')
          }
          onRetry={() => void report.refetch()}
        />
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
          {/* Pinned month total. `top-14` clears the sticky top bar above it. */}
          <div className="sticky top-14 z-20 -mx-4 border-y border-line bg-brand-50 px-4 py-3">
            <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
                  {t('monthly.monthTotal')}
                </p>
                <p className="text-xs text-muted">
                  {t('monthly.days', { count: report.data.totals.workingDays })}
                </p>
              </div>
              <p className="tabnum text-2xl font-bold text-brand-900">
                {formatMoney(report.data.totals.totalIncome)}
              </p>
            </div>
          </div>

          {/* Phone: expandable cards. */}
          <ul className="print-cards flex flex-col gap-2 lg:hidden">
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
                        {formatMoney(row.totalDailyIncome)}
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
                                  {formatMoney(line.unitFee)}
                                </td>
                                <td className="tabnum py-1 text-end font-semibold text-ink">
                                  {formatMoney(line.lineTotal)}
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

          {/* Tablet and desktop: the full table. */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="print-table w-full text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('common.date')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('dashboard.examinations')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('monthly.examIncome')}</th>
                  <th className="px-4 py-3 text-end font-semibold">
                    {t('dashboard.consultations')}
                  </th>
                  <th className="px-4 py-3 text-end font-semibold">{t('monthly.consultIncome')}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t('monthly.dailyTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.data.rows.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-2.5 text-ink">{formatDayLabel(row.date, language)}</td>
                    <td className="tabnum px-4 py-2.5 text-end">
                      {formatCount(row.examinationCount)}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end">
                      {formatMoney(row.examinationIncome)}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end">
                      {formatCount(row.consultationCount)}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end">
                      {formatMoney(row.consultationIncome)}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-end font-semibold">
                      {formatMoney(row.totalDailyIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas font-bold">
                <tr>
                  <td className="px-4 py-3">{t('common.total')}</td>
                  <td className="tabnum px-4 py-3 text-end">
                    {formatCount(report.data.totals.examinationCount)}
                  </td>
                  <td className="tabnum px-4 py-3 text-end">
                    {formatMoney(report.data.totals.examinationIncome)}
                  </td>
                  <td className="tabnum px-4 py-3 text-end">
                    {formatCount(report.data.totals.consultationCount)}
                  </td>
                  <td className="tabnum px-4 py-3 text-end">
                    {formatMoney(report.data.totals.consultationIncome)}
                  </td>
                  <td className="tabnum px-4 py-3 text-end">
                    {formatMoney(report.data.totals.totalIncome)}
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
