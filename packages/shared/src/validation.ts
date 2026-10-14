import type { RequestHandler, Request } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './errors';

function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

function attach<T>(req: Request, key: 'body' | 'query' | 'params', value: T): void {
  if (key === 'body') {
    req.body = value;
  } else {
    Object.assign(req as unknown as Record<string, unknown>, { [key]: value });
  }
}

/** Validates `req.body` with a Zod schema; parsed value replaces req.body. */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(AppError.validation(formatIssues(result.error)));
    }
    attach(req, 'body', result.data);
    next();
  };
}

/** Validates `req.query`; parsed value is stored on `req.validatedQuery`. */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(AppError.validation(formatIssues(result.error)));
    }
    (req as Request & { validatedQuery?: T }).validatedQuery = result.data;
    next();
  };
}

/** Validates `req.params`. */
export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params ?? {});
    if (!result.success) {
      return next(AppError.validation(formatIssues(result.error)));
    }
    attach(req, 'params', result.data);
    next();
  };
}
