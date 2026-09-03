import type { Language } from '../i18n';
import { ar, en } from '../i18n/locales';

/**
 * Display formatting.
 *
 * Money arrives from the API as an exact decimal string and is formatted here for display
 * only - it is never converted to a number for arithmetic. Every total shown in the UI is
 * one the server computed.
 *
 * Numerals stay Western in both languages: Arabic-Indic digits are correct Arabic, but
 * financial figures are read far more quickly in the form clinic staff see on invoices and
 * bank statements.
 */
const NUMBER_LOCALE = 'en-US';

/** Formats "4000.00" as "4,000" and "4000.50" as "4,000.50". */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const hasFraction = Math.abs(amount % 1) > 0;
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat(NUMBER_LOCALE).format(value);
}

function pack(language: Language) {
  return language === 'ar' ? ar : en;
}

export function monthName(month: number, language: Language): string {
  return pack(language).months[month - 1] ?? String(month);
}

export function monthNameShort(month: number, language: Language): string {
  return pack(language).monthsShort[month - 1] ?? String(month);
}

/** Parses `YYYY-MM-DD` without letting the local timezone shift the day. */
function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function weekdayIndex(iso: string): number {
  const { year, month, day } = parts(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "Wed 03 Sep 2026" */
export function formatFullDate(iso: string, language: Language): string {
  const { year, month, day } = parts(iso);
  const strings = pack(language);
  const weekday = strings.weekdaysShort[weekdayIndex(iso)] ?? '';
  return `${weekday} ${String(day).padStart(2, '0')} ${monthNameShort(month, language)} ${year}`;
}

/** "Tue 02 Sep" - the month view already states the year. */
export function formatDayLabel(iso: string, language: Language): string {
  const { month, day } = parts(iso);
  const strings = pack(language);
  const weekday = strings.weekdaysShort[weekdayIndex(iso)] ?? '';
  return `${weekday} ${String(day).padStart(2, '0')} ${monthNameShort(month, language)}`;
}

export function formatMonthYear(year: number, month: number, language: Language): string {
  return `${monthName(month, language)} ${year}`;
}

export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function addDaysIso(iso: string, days: number): string {
  const { year, month, day } = parts(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function lastOfMonth(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Relative time for "last updated", falling back to a plain date beyond a week. */
export function formatRelative(isoTimestamp: string, language: Language): string {
  const then = new Date(isoTimestamp).getTime();
  const diffMinutes = Math.round((Date.now() - then) / 60000);
  const rtf = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar' : 'en', { numeric: 'auto' });

  if (diffMinutes < 1) return rtf.format(0, 'minute');
  if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute');
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days <= 7) return rtf.format(-days, 'day');

  const date = new Date(isoTimestamp);
  return formatFullDate(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`,
    language,
  );
}

/** Service name in the active language, coming from the database rather than the bundle. */
export function serviceName(
  service: { serviceNameEn: string; serviceNameAr: string } | { nameEn: string; nameAr: string },
  language: Language,
): string {
  const en_ = 'serviceNameEn' in service ? service.serviceNameEn : service.nameEn;
  const ar_ = 'serviceNameAr' in service ? service.serviceNameAr : service.nameAr;
  return language === 'ar' ? ar_ : en_;
}
