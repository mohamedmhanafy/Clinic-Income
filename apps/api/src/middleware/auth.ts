import type { NextFunction, Request, Response } from 'express';

/**
 * Authentication seam.
 *
 * Authentication is deliberately not implemented yet, but every route already runs through
 * this middleware and every write already records `req.ctx.userId` onto the row it touches.
 * Adding real authentication later means filling in this one function - no schema change,
 * no route changes, no changes to the services.
 */

export interface RequestContext {
  userId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
    }
  }
}

export function attachContext(req: Request, _res: Response, next: NextFunction): void {
  req.ctx = { userId: null };
  next();
}
