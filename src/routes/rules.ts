import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '../auth/jwtMiddleware';
import { createRule, getRule, updateRule, deleteRule, Rule } from '../services/ruleService';
import { AlgorithmName } from '../algorithms';

const router = Router();
router.use(jwtMiddleware);

const VALID_ALGORITHMS: AlgorithmName[] = ['token_bucket', 'sliding_window', 'fixed_window'];

function validateRuleBody(body: unknown): { valid: true } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'request body is required' };
  }
  const b = body as Record<string, unknown>;

  if (!b.apiKey || typeof b.apiKey !== 'string') {
    return { valid: false, error: 'apiKey is required and must be a string' };
  }
  if (!b.algorithm || !VALID_ALGORITHMS.includes(b.algorithm as AlgorithmName)) {
    return {
      valid: false,
      error: `algorithm must be one of: ${VALID_ALGORITHMS.join(', ')}`,
    };
  }
  if (b.algorithm === 'token_bucket') {
    if (b.capacity === undefined || b.refillRate === undefined) {
      return { valid: false, error: 'token_bucket requires capacity and refillRate' };
    }
  } else {
    if (b.limit === undefined || b.windowMs === undefined) {
      return { valid: false, error: `${b.algorithm} requires limit and windowMs` };
    }
  }
  return { valid: true };
}

/** POST /rules — create a rate limit rule */
router.post('/', async (req: Request, res: Response) => {
  const validation = validateRuleBody(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const rule = await createRule(req.body as Rule);
  res.status(201).json(rule);
});

/** GET /rules/:key — get rule for an api key */
router.get('/:key', async (req: Request, res: Response) => {
  const rule = await getRule(req.params.key as string);
  if (!rule) {
    res.status(404).json({ error: 'rule not found' });
    return;
  }
  res.status(200).json(rule);
});

/** PUT /rules/:key — update (patch) a rule */
router.put('/:key', async (req: Request, res: Response) => {
  const rule = await updateRule(req.params.key as string, req.body as Partial<Rule>);
  if (!rule) {
    res.status(404).json({ error: 'rule not found' });
    return;
  }
  res.status(200).json(rule);
});

/** DELETE /rules/:key — remove a rule */
router.delete('/:key', async (req: Request, res: Response) => {
  const existing = await getRule(req.params.key as string);
  if (!existing) {
    res.status(404).json({ error: 'rule not found' });
    return;
  }
  await deleteRule(req.params.key as string);
  res.status(204).send();
});

export default router;
