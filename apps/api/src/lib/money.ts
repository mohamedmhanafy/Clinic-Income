import { Prisma } from '@prisma/client';

/**
 * Monetary values.
 *
 * Money never becomes a JS `number` anywhere in this codebase. Binary floating point
 * cannot represent 0.1 exactly, so accumulating `number` totals silently corrupts a
 * financial ledger. Internally money is `Prisma.Decimal`; across the API boundary it is a
 * decimal string, which the client formats for display but never does arithmetic on.
 */

export type Money = string;

export const ZERO = new Prisma.Decimal(0);

export function decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Serialise a decimal for the API: always exactly two decimal places. */
export function toMoney(value: Prisma.Decimal | string | number | null | undefined): Money {
  if (value === null || value === undefined) return '0.00';
  return decimal(value).toFixed(2);
}

export function sumMoney(values: Array<Prisma.Decimal | string | number>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(decimal(v)), ZERO);
}

/** quantity x fee, the single place the line-total formula is expressed in code. */
export function lineTotal(quantity: number, unitFee: Prisma.Decimal | string | number): Prisma.Decimal {
  return decimal(unitFee).times(quantity);
}
