import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { describeErrorForLog, stackForLog } from '../util/log-redaction.util';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/** Messages of the SyntaxError / URIError that Nest's RoutesResolver turns into a bare BadRequestException. */
const PARSER_MESSAGE = /is not valid JSON|Unexpected (token|end of JSON input|non-whitespace character after JSON|number in JSON|string in JSON)|in JSON at position|URI malformed|Failed to decode param/i;

/** Prisma connection/pool/timeout codes and PostgreSQL deadlock (40P01) / serialization (40001) failures. */
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034']);
/** Deadlock/serialization victims and server-side connection termination (57P01 admin shutdown/terminate, 57P02, 57P03) - all retryable. */
const TRANSIENT_DB_MESSAGE = /\b(40P01|40001|57P01|57P02|57P03|08006|08003)\b|deadlock detected|could not serialize access|terminating connection|server closed the connection|connection (was )?(closed|terminated|reset)|Can't reach database server/i;
function isTransientDatabaseError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return TRANSIENT_PRISMA_CODES.has(e.code) || TRANSIENT_DB_MESSAGE.test(e.message);
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Prisma.PrismaClientUnknownRequestError) return TRANSIENT_DB_MESSAGE.test(e.message);
  return false;
}

/** An `http-errors`-style client error (what express/body-parser raise): an Error with `expose` and a 4xx `status`. */
function isHttpClientError(e: unknown): e is Error & { status: number } {
  const status = (e as { status?: unknown })?.status;
  return e instanceof Error && typeof status === 'number' && status >= 400 && status < 500 && (e as { expose?: unknown }).expose === true;
}

/**
 * Normalizes every thrown error (Nest HttpException, Prisma errors, or anything
 * else) into { success: false, error: { code, message, details } } so clients
 * never have to special-case error shapes per endpoint (spec section 45).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const code = STATUS_CODES[status] ?? 'ERROR';
      if (typeof response === 'string') {
        body = { code, message: response };
      } else {
        const r = response as Record<string, unknown>;
        // G12 error contract: `message` is always a string. ValidationPipe puts the per-field
        // messages in an array; they stay available (unchanged) in `details`.
        let message = Array.isArray(r.message) ? r.message.join('; ') : ((r.message as string) ?? exception.message);
        // Nest's RoutesResolver wraps body-parser's SyntaxError / Express's URIError as
        // BadRequestException(err.message) - and a JSON parser message can quote a fragment of the
        // request body. Replace it with a fixed message (G12 input-echo hardening).
        const parserError = status === 400 && !r.code && typeof r.message === 'string' && PARSER_MESSAGE.test(r.message);
        if (parserError) message = /URI/.test(r.message as string) ? 'Malformed request URL.' : 'Malformed request body.';
        body = parserError
          ? { code, message }
          : {
              code: (r.code as string) ?? code,
              message,
              details: r.errors ?? r.message,
            };
      }
    } else if (isHttpClientError(exception)) {
      // G12: body-parser / http-errors failures (payload too large, malformed JSON, unsupported
      // charset...) are client errors carrying their own 4xx status - never a 500. The parser's own
      // message is not echoed (it can quote the raw body).
      status = exception.status;
      body = { code: STATUS_CODES[status] ?? 'VALIDATION_ERROR', message: status === 413 ? 'Request body too large.' : 'Malformed request body.' };
    } else if (isTransientDatabaseError(exception)) {
      // G12: connection loss, pool exhaustion, a deadlock victim or a serialization failure is the
      // server's problem and retryable - never a client 400 (the old P2xxx fallback) nor an opaque 500.
      status = HttpStatus.SERVICE_UNAVAILABLE;
      body = { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable - please retry.' };
      this.logger.warn(describeErrorForLog(exception as Error));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { code: 'CONFLICT', message: 'A record with this value already exists.', details: exception.meta };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { code: 'NOT_FOUND', message: 'Resource not found.' };
      } else {
        status = HttpStatus.BAD_REQUEST;
        body = { code: 'DATABASE_ERROR', message: 'Database request error.', details: exception.code };
      }
    } else if (exception instanceof Error) {
      // G12 log privacy: keep the diagnosis, never a credential/JWT/echoed Prisma argument.
      this.logger.error(describeErrorForLog(exception), stackForLog(exception));
      body = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
    }

    res.status(status).json({
      success: false,
      error: body,
      path: req.url,
      timestamp: new Date().toISOString(),
      // Correlation id (spec Phase 11 section 8/86) - set by
      // RequestIdMiddleware on every request; also echoed as the
      // `X-Request-Id` response header on every response, success or error.
      requestId: req.id,
    });
  }
}
