import {
  Bar,
  BarChart,
  Cell,
  LabelList,
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
import { Money } from './ui';

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

const BRAND = '#0f8177';
const GRID = '#e3e7ec';
const MUTED = '#5b6675';
const INK = '#0f172a';

const dataLabelStyle = { fontSize: 11, fontWeight: 600, fill: INK } as const;

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

/** A day/month with nothing recorded still gets a point on the line, but not a "0" label
    crowding every empty spot - only figures worth reading get printed above the line. */
function compactNonZero(value: number): string {
  return value === 0 ? '' : compact(value);
}

/** Clinic names are open-ended in length; cap them so a label can never run into the plot area. */
function truncateLabel(value: string, max = 10): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** A thin vertical line through the hovered bar, the same cursor a line chart shows, instead
    of the full-width gray rectangle Recharts draws by default for a bar chart - that default
    reads as a stray gray bar on a zero-income day since there's no colored bar to mask it. */
function BarLineCursor({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const centerX = x + width / 2;
  return <line x1={centerX} y1={y} x2={centerX} y2={y + height} stroke={MUTED} strokeWidth={1} />;
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
          <Money value={String(item.value)} />
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
      <BarChart data={points} margin={{ top: 18, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} cursor={<BarLineCursor />} />
        <Bar dataKey="income" fill={BRAND} radius={[3, 3, 0, 0]}>
          <LabelList
            dataKey="income"
            position="top"
            formatter={(value: number) => compactNonZero(value)}
            style={dataLabelStyle}
          />
        </Bar>
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
      <LineChart data={points} margin={{ top: 18, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="income"
          stroke={BRAND}
          strokeWidth={2.5}
          dot={{ r: 3, fill: BRAND }}
          activeDot={{ r: 5 }}
        >
          <LabelList
            dataKey="income"
            position="top"
            formatter={(value: number) => compactNonZero(value)}
            style={dataLabelStyle}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}



/**
 * One color per service, cycling if there are more services than colors. Fixed order (not
 * hashed by name) so a given service keeps the same color across renders.
 */
const SLICE_COLORS = [
  '#0f8177',
  '#c2762a',
  '#3b82f6',
  '#a855f7',
  '#e0475f',
  '#0ea5a3',
  '#f59e0b',
  '#6366f1',
];

export function CompositionChart({
  services,
}: {
  /** The service's own name, exactly as configured in Settings - not a fixed exam/consult pair. */
  services: Array<{ name: string; income: string }>;
}) {
  const { t } = useTranslation();

  const slices = services
    .map((service, index) => ({
      name: service.name,
      value: money(service.income),
      color: SLICE_COLORS[index % SLICE_COLORS.length],
    }))
    .filter((slice) => slice.value > 0);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return <p className="py-8 text-center text-sm text-muted">{t('common.noData')}</p>;
  }

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
            <span className="tabnum shrink-0 text-end text-sm text-muted">
              <Money value={String(slice.value)} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
