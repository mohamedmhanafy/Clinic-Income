import { useTranslation } from 'react-i18next';
import { Card, SectionTitle, Spinner } from '../components/ui';
import {
  ComparisonChart,
  CompositionChart,
  DailyTrendChart,
  MonthlyTrendChart,
} from '../components/charts';

/**
 * The dashboard's charts, split into their own lazily-loaded chunk.
 *
 * Recharts is by far the heaviest dependency in the app. Keeping it out of the dashboard's
 * own bundle means the KPI figures - the numbers the user actually opened the app for -
 * paint immediately, and the charts fill in a moment later instead of holding up the whole
 * screen on a phone connection.
 */
export default function DashboardCharts({
  dailyTrend,
  monthlyTrend,
  comparison,
  examinationIncome,
  consultationIncome,
  loading,
}: {
  dailyTrend: Array<{ day: number; income: string }>;
  monthlyTrend: Array<{ label: string; income: string }>;
  comparison: Array<{ clinic: string; income: string }>;
  examinationIncome: string;
  consultationIncome: string;
  loading: { daily: boolean; monthly: boolean; comparison: boolean };
}) {
  const { t } = useTranslation();

  return (
    <>
      <section>
        <SectionTitle>{t('dashboard.dailyTrend')}</SectionTitle>
        <Card className="p-3">
          {loading.daily ? <Spinner /> : <DailyTrendChart data={dailyTrend} />}
        </Card>
      </section>

      <section>
        <SectionTitle>{t('dashboard.composition')}</SectionTitle>
        <Card className="p-4">
          <CompositionChart
            examination={examinationIncome}
            consultation={consultationIncome}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>{t('dashboard.monthlyTrend')}</SectionTitle>
        <Card className="p-3">
          {loading.monthly ? <Spinner /> : <MonthlyTrendChart data={monthlyTrend} />}
        </Card>
      </section>

      <section>
        <SectionTitle>{t('dashboard.comparison')}</SectionTitle>
        <Card className="p-3">
          {loading.comparison ? <Spinner /> : <ComparisonChart data={comparison} />}
        </Card>
      </section>
    </>
  );
}
