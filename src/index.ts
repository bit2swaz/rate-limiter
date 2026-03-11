import app from './app';
import { disconnect } from './services/redisClient';

const PORT = process.env.PORT ?? '3000';
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? '5000');

const server = app.listen(Number(PORT), () => {
  console.log(`server listening on port ${PORT}`);
});

/**
 * Graceful shutdown handler.
 *
 * 1. stops accepting new connections (`server.close`)
 * 2. disconnects from redis
 * 3. exits with code 0 after cleanup, or force-exits after SHUTDOWN_TIMEOUT_MS
 */
function shutdown(signal: string): void {
  console.log(`${signal} received — shutting down gracefully`);

  // force exit if cleanup takes too long
  const timer = setTimeout(() => {
    console.error('shutdown timeout exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  server.close(async () => {
    await disconnect();
    console.log('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

