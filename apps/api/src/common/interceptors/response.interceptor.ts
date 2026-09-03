import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Envelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Wraps every successful response in a single consistent envelope
 * ({ success, data, meta }) so no endpoint invents its own shape (spec section 45).
 * Controllers may attach request-scoped meta (locale, pagination) via `res.locals.meta`.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    const http = context.switchToHttp();
    const res = http.getResponse();

    return next.handle().pipe(
      map((data) => {
        const meta = res?.locals?.meta;
        const envelope: Envelope<T> = { success: true, data };
        if (meta) envelope.meta = meta;
        return envelope;
      }),
    );
  }
}
