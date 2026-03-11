import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { redis } from '../services/redisClient';
import { jwtMiddleware } from '../auth/jwtMiddleware';

const router = Router();

/**
 * POST /keys
 * Issues a new API key, stores it in the redis set `rl:keys`, and returns it.
 * Requires a valid JWT (admin).
 */
router.post('/', jwtMiddleware, async (_req: Request, res: Response) => {
  const apiKey = `usr_${nanoid()}`;
  await redis.sadd('rl:keys', apiKey);
  res.status(201).json({ apiKey });
});

export default router;
