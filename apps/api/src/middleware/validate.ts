import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * Parses a request part with a shared zod schema and replaces it with the parsed value.
 *
 * Every route validates on the server with the same schema the web app uses on the client,
 * so a request that bypasses the UI entirely is still fully checked.
 */
function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'The submitted data is not valid.',
        error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    throw error;
  }
}

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = parse(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Express 5 exposes req.query as a getter, so the parsed value is stashed on res.locals.
      res.locals.query = parse(schema, req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      res.locals.params = parse(schema, req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getQuery<T>(res: Response): T {
  return res.locals.query as T;
}

export function getParams<T>(res: Response): T {
  return res.locals.params as T;
}
