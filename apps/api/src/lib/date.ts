/**
 * Calendar-date helpers.
 *
 * The whole application treats a date as a `YYYY-MM-DD` string with no time and no
 * timezone. The only place a JS `Date` appears is at the Prisma boundary, because
 * `@db.Date` columns are typed that way - and there the value is always UTC midnight.
 *
 * This matters concretely: on a UTC+03:00 machine, `new Date('2026-09-03').toISOString()`
 * round-tripped through local-time getters can yield 2026-09-02, which would book a day's
 * income against the wrong date. Every conversion below uses UTC getters/setters only.
 */

export type IsoDate = string;

/** `YYYY-MM-DD` -> `Date` at UTC midnight, for writing to a `@db.Date` column. */
export function toDbDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** `Date` from a `@db.Date` column -> `YYYY-MM-DD`. */
export function fromDbDate(value: Date): IsoDate {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive first and last day of a month, as ISO date strings. */
export function monthRange(year: number, month: number): { from: IsoDate; to: IsoDate } {
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}

export function yearRange(year: number): { from: IsoDate; to: IsoDate } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Today's date in the server's local timezone, as `YYYY-MM-DD`. */
export function todayIso(): IsoDate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift an ISO date by a whole number of days, staying in UTC. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = toDbDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDbDate(date);
}
