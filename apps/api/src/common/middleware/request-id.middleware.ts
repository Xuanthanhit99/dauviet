import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

// The standard Express+TypeScript augmentation pattern (matches @types/express's
// own declaration shape) - there is no ES2015-module equivalent for extending
// an ambient global namespace, so the lint rule is disabled for this one line.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Per-request correlation id (spec Phase 11 section 86) - echoed back via `X-Request-Id` and included in every error response body. */
      id: string;
    }
  }
}

/**
 * Assigns a short, opaque correlation id to every request (spec section 86)
 * - reuses an inbound `X-Request-Id` if a client/proxy already set one
 * (e.g. an upstream load balancer), otherwise generates a fresh one. Not an
 * observability system - just enough for a frontend/QA engineer to hand a
 * support/bug report a single stable id that also appears in server logs
 * and in `AllExceptionsFilter`'s error body.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const inbound = req.header('x-request-id');
    req.id = inbound && inbound.trim().length > 0 ? inbound : nanoid();
    res.setHeader('X-Request-Id', req.id);
    next();
  }
}
