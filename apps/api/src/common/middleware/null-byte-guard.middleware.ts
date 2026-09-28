import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const MAX_NODES = 200_000;

/** Iterative (no recursion - bodies may be deeply nested) search for a U+0000 in any string key/value. */
export function containsNulByte(value: unknown): boolean {
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0 && visited++ < MAX_NODES) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (v.includes('\u0000')) return true;
    } else if (Array.isArray(v)) {
      stack.push(...v);
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k.includes('\u0000')) return true;
        stack.push(child);
      }
    }
  }
  return false;
}

/**
 * G12 input hardening. PostgreSQL text can never contain U+0000, so a NUL byte anywhere in the
 * path, query or JSON body used to travel all the way to the driver and fail there as an
 * unexplained 500 ("invalid byte sequence for encoding UTF8: 0x00"). No legitimate request carries
 * one; reject it up front with the ordinary 400 envelope.
 */
@Injectable()
export class NullByteGuardMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (/%00/i.test(req.originalUrl) || containsNulByte(req.query) || containsNulByte(req.body)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Request contains a NUL character.' });
    }
    next();
  }
}
