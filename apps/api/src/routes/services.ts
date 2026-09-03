import { Router } from 'express';
import { z } from 'zod';
import { idSchema, serviceCreateSchema, serviceUpdateSchema } from '@clinic/shared';
import {
  getParams,
  getQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { createService, deleteService, listServices, updateService } from '../services/service-types.js';

export const servicesRouter = Router();

const serviceParams = z.object({ id: idSchema });
const listQuery = z.object({
  clinicId: idSchema,
  includeInactive: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

servicesRouter.get('/', validateQuery(listQuery), async (_req, res) => {
  const { clinicId, includeInactive } = getQuery<{ clinicId: number; includeInactive: boolean }>(res);
  res.json(await listServices(clinicId, includeInactive));
});

servicesRouter.post('/', validateBody(serviceCreateSchema), async (req, res) => {
  res.status(201).json(await createService(req.body));
});

servicesRouter.patch(
  '/:id',
  validateParams(serviceParams),
  validateBody(serviceUpdateSchema),
  async (req, res) => {
    const { id } = getParams<{ id: number }>(res);
    res.json(await updateService(id, req.body));
  },
);

servicesRouter.delete('/:id', validateParams(serviceParams), async (_req, res) => {
  const { id } = getParams<{ id: number }>(res);
  await deleteService(id);
  res.status(204).end();
});
