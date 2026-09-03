import { Router } from 'express';
import { z } from 'zod';
import { dailyQuerySchema, dailyUpsertSchema, idSchema } from '@clinic/shared';
import {
  getParams,
  getQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { deleteDaily, getDailyEntryView, upsertDaily } from '../services/daily.js';

export const dailyRouter = Router();

const dailyParams = z.object({ id: idSchema });

/** Returns the saved record for a clinic-day, or a blank one plus the applicable fees. */
dailyRouter.get('/', validateQuery(dailyQuerySchema), async (_req, res) => {
  const { clinicId, date } = getQuery<{ clinicId: number; date: string }>(res);
  res.json(await getDailyEntryView(clinicId, date));
});

/**
 * PUT, not POST: the record is identified by (clinic, date) rather than by an id, so this
 * endpoint creates or updates as needed. Saving the same day twice can never produce a
 * duplicate, and a retried request is harmless.
 */
dailyRouter.put('/', validateBody(dailyUpsertSchema), async (req, res) => {
  res.json(await upsertDaily(req.body, req.ctx.userId));
});

dailyRouter.delete('/:id', validateParams(dailyParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  await deleteDaily(id);
  res.status(204).end();
});
