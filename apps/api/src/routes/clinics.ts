import { Router } from 'express';
import { z } from 'zod';
import {
  clinicCreateSchema,
  clinicUpdateSchema,
  idSchema,
  priceCreateSchema,
  priceScheduleChangeSchema,
} from '@clinic/shared';
import {
  getParams,
  getQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { createClinic, deleteClinic, getClinic, listClinics, updateClinic } from '../services/clinics.js';
import { createPrice, listPrices, schedulePriceChange } from '../services/pricing.js';

export const clinicsRouter = Router();

const clinicParams = z.object({ id: idSchema });
const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

clinicsRouter.get('/', validateQuery(listQuery), async (_req, res) => {
  const { includeInactive } = getQuery<{ includeInactive: boolean }>(res);
  res.json(await listClinics(includeInactive));
});

clinicsRouter.post('/', validateBody(clinicCreateSchema), async (req, res) => {
  res.status(201).json(await createClinic(req.body));
});

clinicsRouter.get('/:id', validateParams(clinicParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  res.json(await getClinic(id));
});

clinicsRouter.patch(
  '/:id',
  validateParams(clinicParams),
  validateBody(clinicUpdateSchema),
  async (req, res) => {
    const { id } = getParams<{ id: number }>(res);
    res.json(await updateClinic(id, req.body));
  },
);

clinicsRouter.delete('/:id', validateParams(clinicParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  await deleteClinic(id);
  res.status(204).end();
});

/* Pricing is nested under the clinic it belongs to. */

clinicsRouter.get('/:id/prices', validateParams(clinicParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  await getClinic(id);
  res.json(await listPrices(id));
});

clinicsRouter.post(
  '/:id/prices',
  validateParams(clinicParams),
  validateBody(priceCreateSchema),
  async (req, res) => {
    const { id } = getParams<{ id: number }>(res);
    await getClinic(id);
    res.status(201).json(await createPrice(id, req.body));
  },
);

/**
 * Change a fee from a date, closing the running period automatically. This is what the
 * pricing screen uses, because the raw create above would collide with an existing
 * open-ended period and force the user to close it by hand first.
 */
clinicsRouter.post(
  '/:id/prices/schedule-change',
  validateParams(clinicParams),
  validateBody(priceScheduleChangeSchema),
  async (req, res) => {
    const { id } = getParams<{ id: number }>(res);
    await getClinic(id);
    res.status(201).json(await schedulePriceChange(id, req.body));
  },
);
