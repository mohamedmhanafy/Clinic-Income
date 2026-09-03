import { z } from 'zod';

/**
 * Shared primitive schemas.
 *
 * Two conventions are enforced here and relied on by the entire codebase:
 *
 * 1. DATES travel as `YYYY-MM-DD` strings, never as JS `Date` objects. Serialising a
 *    `Date` with `toISOString()` from a UTC+02:00/+03:00 machine can shift the calendar
 *    day backwards and book income against the wrong date. Strings avoid that entirely.
 *
 * 2. MONEY travels as decimal strings, never as JS `number`. Binary floating point
 *    cannot represent values like 0.1 exactly, which is unacceptable in a financial
 *    ledger. All monetary arithmetic happens server-side in `Prisma.Decimal` or in SQL.
 */

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a string that names a real day on the calendar (rejects 2026-02-30). */
export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export const isoDateSchema = z
  .string({ required_error: 'Date is required' })
  .trim()
  .regex(ISO_DATE_REGEX, 'Date must be in YYYY-MM-DD format')
  .refine(isRealCalendarDate, 'Date is not a valid calendar date');

/** Database row identifier. */
export const idSchema = z.coerce
  .number()
  .int('Identifier must be a whole number')
  .positive('Identifier must be positive');

/**
 * A monetary amount supplied by a client (a fee). Accepts a number or a string and
 * normalises to a canonical decimal string. Negative values are rejected here, and again
 * by a CHECK constraint in the database.
 */
export const moneyInputSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toString() : value.trim()))
  .refine((value) => value.length > 0, 'Amount is required')
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value),
    'Amount must be zero or greater, with at most 2 decimal places',
  );

/** A count of services performed. Never negative. */
export const quantitySchema = z.coerce
  .number({ invalid_type_error: 'Count must be a number' })
  .int('Count must be a whole number')
  .min(0, 'Count cannot be negative')
  .max(100000, 'Count is unrealistically large');

export const yearSchema = z.coerce
  .number()
  .int()
  .min(2000, 'Year must be 2000 or later')
  .max(2100, 'Year must be 2100 or earlier');

export const monthSchema = z.coerce
  .number()
  .int()
  .min(1, 'Month must be between 1 and 12')
  .max(12, 'Month must be between 1 and 12');

export const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type Status = z.infer<typeof statusSchema>;

export const exportFormatSchema = z.enum(['json', 'csv', 'xlsx']).default('json');
export type ExportFormat = z.infer<typeof exportFormatSchema>;
