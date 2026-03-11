import { JwtPayload } from '../auth/jwtMiddleware';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
