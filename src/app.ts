import express from 'express';
import dotenv from 'dotenv';
import { authRouter } from './auth/jwtMiddleware';
import keysRouter from './routes/keys';
import rulesRouter from './routes/rules';

dotenv.config();

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/keys', keysRouter);
app.use('/rules', rulesRouter);

export default app;
