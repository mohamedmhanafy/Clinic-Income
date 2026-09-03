import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';

/**
 * Database constraints are part of the product's contract, so when one fires the user gets
 * a sentence that explains what to do - not a raw Postgres string. Keyed by constraint
 * name, which is why the names in the migration are explicit and stable.
 */
const CONSTRAINT_MESSAGES: Record<string, { status: number; code: string; message: string }> = {
  clinic_prices_no_overlapping_periods: {
    status: 409,
    code: 'PRICE_PERIOD_OVERLAP',
    message:
      'This price period overlaps an existing one for the same clinic and service. Close the earlier period first, or choose different dates.',
  },
  clinic_prices_valid_period: {
    status: 400,
    code: 'INVALID_PRICE_PERIOD',
    message: 'The end date of a price period must be on or after its start date.',
  },
  clinic_prices_fee_non_negative: {
    status: 400,
    code: 'NEGATIVE_FEE',
    message: 'A fee cannot be negative.',
  },
  daily_activity_lines_quantity_non_negative: {
    status: 400,
    code: 'NEGATIVE_COUNT',
    message: 'A service count cannot be negative.',
  },
  daily_activity_lines_unit_fee_non_negative: {
    status: 400,
    code: 'NEGATIVE_FEE',
    message: 'A fee cannot be negative.',
  },
  daily_activity_lines_total_matches_formula: {
    status: 500,
    code: 'INCOME_FORMULA_VIOLATION',
    message:
      'Refused to store an income figure that does not equal count x fee. The record was not saved.',
  },
  daily_activities_clinic_id_activity_date_key: {
    status: 409,
    code: 'DUPLICATE_DAY',
    message: 'A record already exists for this clinic on this date. Edit that record instead.',
  },
  clinics_name_key: {
    status: 409,
    code: 'DUPLICATE_CLINIC',
    message: 'A clinic with this name already exists.',
  },
  services_code_key: {
    status: 409,
    code: 'DUPLICATE_SERVICE',
    message: 'A service with this code already exists.',
  },
};

function matchConstraint(text: string) {
  for (const [name, mapped] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(name)) return mapped;
  }
  return null;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = Array.isArray(error.meta?.target)
      ? (error.meta.target as string[]).join(',')
      : String(error.meta?.target ?? '');
    const mapped = matchConstraint(`${target} ${error.message}`);
    if (mapped) {
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'That value is already in use.' },
      });
      return;
    }
    if (error.code === 'P2003') {
      res.status(400).json({
        error: {
          code: 'INVALID_REFERENCE',
          message: 'The request refers to a clinic or service that does not exist.',
        },
      });
      return;
    }
    if (error.code === 'P2014') {
      res.status(409).json({
        error: {
          code: 'CONSTRAINT_VIOLATION',
          message: 'This record cannot be deleted because other data depends on it.',
        },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
      return;
    }
  }

  // Exclusion and CHECK constraint violations are not modelled by Prisma and arrive as
  // unknown/raw errors, so they are matched by constraint name in the message text.
  const raw = error instanceof Error ? error.message : String(error);
  const mapped = matchConstraint(raw);
  if (mapped) {
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    return;
  }

  console.error('[api] unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong while processing the request.',
      ...(config.isProduction ? {} : { details: raw }),
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
}
