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
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

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
        body = {
          code: (r.code as string) ?? code,
          message: (r.message as string) ?? exception.message,
          details: r.errors ?? r.message,
        };
      }
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
      this.logger.error(exception.message, exception.stack);
      body = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
    }

    res.status(status).json({
      success: false,
      error: body,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
