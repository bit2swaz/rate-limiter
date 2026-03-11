import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

/**
 * Returns an Express middleware that validates `req.body` against `schema`.
 * On success, replaces `req.body` with the parsed (coerced/stripped) data.
 * On failure, responds with `400 Bad Request` and structured Zod issue details.
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: result.error.issues[0]?.message ?? 'validation error',
        issues: result.error.issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
