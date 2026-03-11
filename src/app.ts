import express from 'express';
import dotenv from 'dotenv';
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

export default app;
