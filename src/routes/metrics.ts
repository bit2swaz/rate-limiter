import { Router, Request, Response } from 'express';
import { register } from '../observability/metrics';

const router = Router();

/**
 * GET /metrics
 * Prometheus exposition format endpoint for scraping.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end((err as Error).message);
  }
});

export default router;
