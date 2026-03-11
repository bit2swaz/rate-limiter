import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'admin';

/** payload embedded in every issued JWT */
export interface JwtPayload {
  sub: string;
  role: string;
}

/**
 * Sign a JWT with the configured secret and expiry.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws a JsonWebTokenError if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Express middleware that requires a valid `Authorization: Bearer <token>` header.
 * Attaches the decoded payload to `req.user` on success.
 */
export function jwtMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or invalid authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

/**
 * Router that exposes POST /token — issues a JWT for admin access.
 * Credentials are read from ADMIN_USER / ADMIN_PASS env vars.
 */
export const authRouter = Router();

authRouter.post('/token', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || username !== ADMIN_USER || password !== ADMIN_PASS) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  const token = signToken({ sub: username, role: 'admin' });
  res.status(200).json({ token });
});
