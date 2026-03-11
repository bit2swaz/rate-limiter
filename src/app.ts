import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { authRouter } from './auth/jwtMiddleware';
import keysRouter from './routes/keys';
import rulesRouter from './routes/rules';
import metricsRouter from './routes/metrics';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware';

dotenv.config();

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/keys', keysRouter);
app.use('/rules', rulesRouter);
app.use('/metrics', metricsRouter);

// rate-limited proxy: any method, any sub-path
app.use('/proxy', rateLimitMiddleware, (_req, res) => {
  res.status(200).json({ message: 'ok' });
});

// swagger ui — only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  const openapiPath = path.resolve(__dirname, '../docs/openapi.yaml');
  if (fs.existsSync(openapiPath)) {
    const spec = yaml.load(fs.readFileSync(openapiPath, 'utf8')) as object;
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  }
}

export default app;
