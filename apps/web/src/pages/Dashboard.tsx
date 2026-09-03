import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import { useAnnual, useComparison, useDashboard, useMonthly } from '../lib/queries';
import { ApiError } from '../lib/api';
import { formatCount, formatMoney, monthNameShort } from '../lib/format';
import { Card, EmptyState, ErrorNotice, SectionTitle, Spinner } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';

// Recharts lives entirely inside this chunk, so the KPI figures above paint without it.
const DashboardCharts = lazy(() => import('./DashboardCharts'));

/**
 * Dashboard.
 *
 * On a phone the hierarchy is deliberate: one hero figure the user came to see, then the
 * supporting KPIs two-up, then charts. Everything above the fold answers "how is this
 * month going" without scrolling.
 */

function KpiCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'exam' | 'consult';
}) {
  const accent =
    tone === 'exam'
      ? 'border-s-4 border-s-[--color-exam]'
      : tone === 'consult'
        ? 'border-s-4 border-s-[--color-consult]'
        : '';

  return (
    <Card className={`p-3.5 ${accent}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabnum mt-1 text-xl font-bold text-ink">{value}</p>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { clinicId, year, month, language } = useAppState();

  const summary = useDashboard(clinicId, year, month);
  const monthly = useMonthly(clinicId, year, month);
  const annual = useAnnual(year);
  const comparison = useComparison({ year, month });

  if (summary.isPending) return <Spinner />;

  if (summary.isError) {
    return (
      <ErrorNotice
        message={
          summary.error instanceof ApiError ? summary.error.message : t('common.somethingWrong')
        }
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const data = summary.data;
  const hasIncome = Number(data.totalIncome) > 0;

  const dailyTrend =
    monthly.data?.rows.map((row) => ({ day: row.dayOfMonth, income: row.totalDailyIncome })) ?? [];

  const monthlyTrend =
    annual.data?.rows.map((row) => ({
      label: monthNameShort(row.month, language),
      income: row.byClinic[String(clinicId)] ?? '0.00',
    })) ?? [];

  const comparisonData =
    comparison.data?.rows.map((row) => ({ clinic: row.clinicName, income: row.totalIncome })) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{data.clinicName}</h1>
        <p className="text-sm text-muted">{t('dashboard.title')}</p>
      </div>

      <PeriodBar />

      {/* Hero KPI: the single number the screen exists to show. */}
      <Card className="bg-brand-600 p-5 text-white">
        <p className="text-sm font-medium opacity-90">{t('dashboard.totalIncome')}</p>
        <p className="tabnum mt-1 text-4xl font-bold">{formatMoney(data.totalIncome)}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label={t('dashboard.examinationIncome')}
          value={formatMoney(data.examinationIncome)}
          tone="exam"
        />
        <KpiCard
          label={t('dashboard.consultationIncome')}
          value={formatMoney(data.consultationIncome)}
          tone="consult"
        />
        <KpiCard label={t('dashboard.examinations')} value={formatCount(data.examinationCount)} />
        <KpiCard label={t('dashboard.consultations')} value={formatCount(data.consultationCount)} />
      </div>

      <KpiCard label={t('dashboard.workingDays')} value={formatCount(data.workingDays)} />

      {/* Any service beyond the seeded two appears here automatically. */}
      {data.byService.length > 2 && (
        <section>
          <SectionTitle>{t('common.service')}</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {data.byService.map((row) => (
                <li key={row.serviceId} className="flex items-center justify-between gap-3 p-3.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {language === 'ar' ? row.serviceNameAr : row.serviceNameEn}
                  </span>
                  <span className="tabnum text-sm text-muted">{formatCount(row.quantity)}</span>
                  <span className="tabnum w-24 text-end text-sm font-semibold text-ink">
                    {formatMoney(row.income)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {!hasIncome ? (
        <EmptyState
          title={t('common.noData')}
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
      ) : (
        <Suspense fallback={<Spinner />}>
          <DashboardCharts
            dailyTrend={dailyTrend}
            monthlyTrend={monthlyTrend}
            comparison={comparisonData}
            examinationIncome={data.examinationIncome}
            consultationIncome={data.consultationIncome}
            loading={{
              daily: monthly.isPending,
              monthly: annual.isPending,
              comparison: comparison.isPending,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
