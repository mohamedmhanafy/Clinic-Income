import { z } from 'zod';
import {
  exportFormatSchema,
  idSchema,
  isoDateSchema,
  moneyInputSchema,
  monthSchema,
  quantitySchema,
  statusSchema,
  yearSchema,
} from './primitives.js';

/* -------------------------------------------------------------------------- */
/* Clinics                                                                     */
/* -------------------------------------------------------------------------- */

export const clinicCreateSchema = z.object({
  name: z
    .string({ required_error: 'Clinic name is required' })
    .trim()
    .min(1, 'Clinic name is required')
    .max(120, 'Clinic name is too long'),
  status: statusSchema.default('ACTIVE'),
});

export const clinicUpdateSchema = clinicCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update',
);

export type ClinicCreateInput = z.infer<typeof clinicCreateSchema>;
export type ClinicUpdateInput = z.infer<typeof clinicUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Services                                                                    */
/* -------------------------------------------------------------------------- */

export const serviceCreateSchema = z.object({
  clinicId: idSchema,
  code: z
    .string({ required_error: 'Service code is required' })
    .trim()
    .min(1, 'Service code is required')
    .max(40, 'Service code is too long')
    .regex(/^[A-Z0-9_]+$/, 'Service code may contain only A-Z, 0-9 and underscore'),
  nameEn: z.string().trim().min(1, 'English name is required').max(120),
  nameAr: z.string().trim().min(1, 'Arabic name is required').max(120),
  status: statusSchema.default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const serviceUpdateSchema = serviceCreateSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Pricing                                                                     */
/* -------------------------------------------------------------------------- */

const priceRangeRefinement = (value: { effectiveFrom: string; effectiveTo?: string | null }) =>
  !value.effectiveTo || value.effectiveTo >= value.effectiveFrom;

export const priceCreateSchema = z
  .object({
    serviceId: idSchema,
    fee: moneyInputSchema,
    effectiveFrom: isoDateSchema,
    // `null` means open-ended: this price applies from `effectiveFrom` onwards.
    effectiveTo: isoDateSchema.nullish(),
  })
  .refine(priceRangeRefinement, {
    message: 'End date must be on or after the start date',
    path: ['effectiveTo'],
  });

export const priceUpdateSchema = z
  .object({
    fee: moneyInputSchema.optional(),
    effectiveFrom: isoDateSchema.optional(),
    effectiveTo: isoDateSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export type PriceCreateInput = z.infer<typeof priceCreateSchema>;
export type PriceUpdateInput = z.infer<typeof priceUpdateSchema>;

export const effectivePriceQuerySchema = z.object({
  clinicId: idSchema,
  date: isoDateSchema,
});

/* -------------------------------------------------------------------------- */
/* Daily activity                                                              */
/* -------------------------------------------------------------------------- */

export const dailyLineInputSchema = z.object({
  serviceId: idSchema,
  quantity: quantitySchema,
});

/**
 * Upsert payload for one clinic-day.
 *
 * Deliberately keyed on (clinicId, date) rather than on a record id: the endpoint is an
 * upsert, which makes "edit the existing record instead of creating a duplicate" the only
 * possible behaviour and makes the call idempotent.
 */
export const dailyUpsertSchema = z
  .object({
    clinicId: idSchema,
    date: isoDateSchema,
    lines: z.array(dailyLineInputSchema).min(1, 'At least one service line is required'),
    note: z.string().trim().max(500).nullish(),
    /**
     * When false (the default) the fees already stored on an existing record are kept, so
     * historical figures never move because of a later price change. When true the price
     * schedule effective on `date` is re-read and re-applied - used to repair a record
     * that was saved against a mis-entered price row.
     */
    reapplyPriceSchedule: z.boolean().default(false),
  })
  .refine(
    (value) => new Set(value.lines.map((line) => line.serviceId)).size === value.lines.length,
    { message: 'Each service may appear only once', path: ['lines'] },
  );

export type DailyUpsertInput = z.infer<typeof dailyUpsertSchema>;

export const dailyQuerySchema = z.object({
  clinicId: idSchema,
  date: isoDateSchema,
});

/* -------------------------------------------------------------------------- */
/* Reports & dashboard                                                         */
/* -------------------------------------------------------------------------- */

export const monthQuerySchema = z.object({
  clinicId: idSchema,
  year: yearSchema,
  month: monthSchema,
  format: exportFormatSchema,
});

export const dailyReportQuerySchema = z.object({
  clinicId: idSchema,
  date: isoDateSchema,
  format: exportFormatSchema,
});

export const annualQuerySchema = z.object({
  clinicId: idSchema,
  year: yearSchema,
  format: exportFormatSchema,
});

export const customQuerySchema = z.object({
  clinicId: idSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  format: exportFormatSchema,
});

export const dashboardQuerySchema = z.object({
  clinicId: idSchema,
  year: yearSchema,
  month: monthSchema,
});

/**
 * Schedule a fee change from a given date.
 *
 * This is the operation the pricing screen actually needs. Adding a 2027 fee while the
 * 2026 fee is still open-ended would overlap it, which the database rejects; this closes
 * the running period the day before the new one starts and opens the new one, atomically.
 */
export const priceScheduleChangeSchema = z.object({
  serviceId: idSchema,
  fee: moneyInputSchema,
  effectiveFrom: isoDateSchema,
});

export type PriceScheduleChangeInput = z.infer<typeof priceScheduleChangeSchema>;
