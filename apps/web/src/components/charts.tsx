import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';

/**
 * Charts.
 *
 * Recharts values must be numbers, so money is converted here - at the display edge, where
 * it is about to be drawn and never read back for arithmetic. Every figure a user acts on
 * is rendered from the exact decimal string instead.
 *
 * Sizing is tuned for a phone: short, full-bleed, few ticks, no legend. A dense desktop
 * chart shrunk to 390px is unreadable, so these start small and stay legible when they
 * grow.
 */

const EXAM_COLOR = '#0f8177';
const CONSULT_COLOR = '#c2762a';
const BRAND = '#0f8177';
const GRID = '#e3e7ec';
const MUTED = '#5b6675';

function money(value: string): number {
  return Number(value);
}

const axisProps = {
  stroke: MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: { stroke: GRID },
} as const;

/** Compact axis labels: 85,400 becomes 85.4k so the axis does not crowd on a phone. */
function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(value);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      {payload.map((item, index) => (
        <p key={index} className="tabnum text-sm font-semibold text-ink">
          {formatMoney(String(item.value))}
        </p>
      ))}
    </div>
  );
}

export function DailyTrendChart({
  data,
}: {
  data: Array<{ day: number; income: string }>;
}) {
  const points = data.map((row) => ({ day: row.day, income: money(row.income) }));

  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
        <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} width={46} tickFormatter={compact} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,129,119,0.08)' }} />
        <Bar dataKey="income" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyTrendChart({
  data,
}: {
  data: Array<{ label: string; income: string }>;
}) {
  const points = data.map((row) => ({ label: row.label, income: money(row.income) }));

  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} width={46} tickFormatter={compact} />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="income"
          stroke={BRAND}
          strokeWidth={2.5}
          dot={{ r: 3, fill: BRAND }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ComparisonChart({
  data,
}: {
  data: Array<{ clinic: string; income: string }>;
}) {
  const points = data.map((row) => ({ clinic: row.clinic, income: money(row.income) }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(150, points.length * 52)}>
      <BarChart data={points} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
        <XAxis type="number" {...axisProps} tickFormatter={compact} />
        {/* Horizontal bars: clinic names read normally instead of being rotated, which
            matters more once names are long or Arabic. */}
        <YAxis type="category" dataKey="clinic" {...axisProps} width={84} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,129,119,0.08)' }} />
        <Bar dataKey="income" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CompositionChart({
  examination,
  consultation,
}: {
  examination: string;
  consultation: string;
}) {
  const { t } = useTranslation();
  const examValue = money(examination);
  const consultValue = money(consultation);
  const total = examValue + consultValue;

  if (total <= 0) {
    return <p className="py-8 text-center text-sm text-muted">{t('common.noData')}</p>;
  }

  const slices = [
    { name: t('dashboard.examinationIncome'), value: examValue, color: EXAM_COLOR },
    { name: t('dashboard.consultationIncome'), value: consultValue, color: CONSULT_COLOR },
  ];

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <div className="w-full max-w-[190px]">
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={46}
              outerRadius={74}
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* The legend carries the percentages, so the reader never has to judge them by eye. */}
      <ul className="flex w-full flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-sm text-muted">{slice.name}</span>
            <span className="tabnum text-sm font-semibold text-ink">
              {Math.round((slice.value / total) * 100)}%
            </span>
            <span className="tabnum w-20 text-end text-sm text-muted">
              {formatMoney(String(slice.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
