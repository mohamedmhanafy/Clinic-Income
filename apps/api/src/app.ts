import express from 'express';
import cors from 'cors';
import { dashboardQuerySchema } from '@clinic/shared';
import { config } from './config.js';
import { attachContext } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { getQuery, validateQuery } from './middleware/validate.js';
import { getDashboardSummary } from './services/reports.js';
import { clinicsRouter } from './routes/clinics.js';
import { servicesRouter } from './routes/services.js';
import { pricesRouter } from './routes/pricing.js';
import { dailyRouter } from './routes/daily.js';
import { reportsRouter } from './routes/reports.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Every request carries a context object. It holds a null user today; when
  // authentication is added this is the only place that needs to change.
  app.use(attachContext);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', currency: config.currencyCode });
  });

  app.get('/api/dashboard/summary', validateQuery(dashboardQuerySchema), async (_req, res) => {
    const { clinicId, year, month } = getQuery<{
      clinicId: number;
      year: number;
      month: number;
    }>(res);
    res.json(await getDashboardSummary(clinicId, year, month));
  });

  app.use('/api/clinics', clinicsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/prices', pricesRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/reports', reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
