import { Router } from 'express';
import { z } from 'zod';
import { effectivePriceQuerySchema, idSchema, priceUpdateSchema } from '@clinic/shared';
import {
  getParams,
  getQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { deletePrice, getEffectivePrices, updatePrice } from '../services/pricing.js';

export const pricesRouter = Router();

const priceParams = z.object({ id: idSchema });

/**
 * The fee schedule applicable to a clinic on a given date. This is what pre-fills the
 * daily-entry form, and what tells the UI that a service has no price for the chosen day.
 */
pricesRouter.get('/effective', validateQuery(effectivePriceQuerySchema), async (_req, res) => {
  const { clinicId, date } = getQuery<{ clinicId: number; date: string }>(res);
  res.json(await getEffectivePrices(clinicId, date));
});

pricesRouter.patch(
  '/:id',
  validateParams(priceParams),
  validateBody(priceUpdateSchema),
  async (req, res) => {
    const { id } = getParams<{ id: number }>(res);
    res.json(await updatePrice(id, req.body));
  },
);

pricesRouter.delete('/:id', validateParams(priceParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  await deletePrice(id);
  res.status(204).end();
});
