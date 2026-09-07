import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import { useDashboard } from '../lib/queries';
import { ApiError } from '../lib/api';
import { formatCount } from '../lib/format';
import { Card, EmptyState, ErrorNotice, Money, SectionTitle, Spinner } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';

/**
 * Dashboard.
 *
 * On a phone the hierarchy is deliberate: one hero figure the user came to see, then the
 * supporting KPIs two-up, then the service breakdown. Everything here answers "how is this
 * month going" without scrolling; trends and composition live in Reports, where a period can
 * be picked and compared rather than just glanced at.
 */

function KpiCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabnum mt-1 text-xl font-bold text-ink">{value}</p>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { clinicId, year, month, language } = useAppState();

  const summary = useDashboard(clinicId, year, month);

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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('dashboard.title')}</h1>
      </div>

      <PeriodBar />

      {/* Hero KPI: the single number the screen exists to show. */}
      <Card className="bg-brand-600 p-5 text-white">
        <p className="text-sm font-medium opacity-90">{t('dashboard.totalIncome')}</p>
        <p className="tabnum mt-1 text-4xl font-bold">
          <Money value={data.totalIncome} />
        </p>
      </Card>

      {/* One horizontal pair per service - income and count side by side - named exactly as
          configured in Settings > Services rather than a fixed examination/consultation
          pair a clinic may not even have. */}
      {data.byService.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.byService.map((row) => (
            <div key={row.serviceId}>
              <p className="mb-1.5 truncate text-sm font-semibold text-ink">
                {language === 'ar' ? row.serviceNameAr : row.serviceNameEn}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label={t('common.income')} value={<Money value={row.income} />} />
                <KpiCard label={t('common.count')} value={formatCount(row.quantity)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <KpiCard label={t('dashboard.workingDays')} value={formatCount(data.workingDays)} />

      {!hasIncome && (
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
      )}
    </div>
  );
}
