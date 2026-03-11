import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '../auth/jwtMiddleware';
import { createRule, getRule, updateRule, deleteRule, Rule } from '../services/ruleService';
import { validate } from '../middleware/validate';
import { ruleSchema, partialRuleSchema } from '../validators/ruleSchema';

const router = Router();
router.use(jwtMiddleware);

/** POST /rules — create a rate limit rule */
router.post('/', validate(ruleSchema), async (req: Request, res: Response) => {
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
router.put('/:key', validate(partialRuleSchema), async (req: Request, res: Response) => {
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
