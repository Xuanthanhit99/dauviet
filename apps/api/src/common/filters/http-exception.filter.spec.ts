import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

/** G12 error-contract certification for the global filter (status + envelope + no leakage). */
describe('AllExceptionsFilter (G12 error contract)', () => {
  const run = (exception: unknown) => {
    let status = 0;
    let body: any;
    const res = { status: (s: number) => ((status = s), { json: (b: unknown) => (body = b) }) };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/v1/x', id: 'req-1' }) }) } as any;
    new AllExceptionsFilter().catch(exception, host);
    return { status, body };
  };
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError(`boom ${code}`, { code, clientVersion: '5.20.0' });

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('validation errors: message is always a string, per-field messages stay in details', () => {
    const { status, body } = run(new BadRequestException({ message: ['title must be a string', 'title should not be empty'], error: 'Bad Request', statusCode: 400 }));
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'title must be a string; title should not be empty', details: ['title must be a string', 'title should not be empty'] });
    expect(body.requestId).toBe('req-1');
  });

  it.each([
    ['Unexpected end of JSON input', 'Malformed request body.'],
    [`Unexpected token 'x', "{"secret":x}" is not valid JSON`, 'Malformed request body.'],
    ['URI malformed', 'Malformed request URL.'],
  ])('a wrapped parser error %p never echoes request content', (raw, expected) => {
    const { status, body } = run(new BadRequestException(raw));
    expect([status, body.error.code, body.error.message]).toEqual([400, 'VALIDATION_ERROR', expected]);
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('an ordinary coded 400 is untouched even if it mentions JSON', () => {
    const { body } = run(new BadRequestException({ code: 'INGESTION_PAYLOAD_INVALID', message: 'evidence must be a JSON object' }));
    expect(body.error.message).toBe('evidence must be a JSON object');
  });

  it('domain codes pass through unchanged', () => {
    const { status, body } = run(new ForbiddenException({ code: 'TRIP_PERMISSION_DENIED', message: 'no' }));
    expect([status, body.error.code, body.error.message]).toEqual([403, 'TRIP_PERMISSION_DENIED', 'no']);
  });

  it.each([
    [413, 'entity.too.large', 'PAYLOAD_TOO_LARGE'],
    [400, 'entity.parse.failed', 'VALIDATION_ERROR'],
    [415, 'charset.unsupported', 'UNSUPPORTED_MEDIA_TYPE'],
  ])('body-parser %s (%s) keeps its 4xx and never echoes the raw body', (status, type, code) => {
    const err = Object.assign(new Error('Unexpected token } in JSON at position 12: {"secret":"x"'), { status, statusCode: status, expose: true, type });
    const out = run(err);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(code);
    expect(JSON.stringify(out.body)).not.toContain('secret');
  });

  it.each(['P1001', 'P1017', 'P2024', 'P2034'])('transient Prisma %s -> 503 SERVICE_UNAVAILABLE (retryable), not a client 400', (code) => {
    const { status, body } = run(known(code));
    expect([status, body.error.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
  });

  it('a PostgreSQL deadlock victim (40P01 via PrismaClientUnknownRequestError) -> 503, not 500', () => {
    const err = new Prisma.PrismaClientUnknownRequestError('ConnectorError { code: "40P01", message: "deadlock detected" }', { clientVersion: '5.20.0' });
    expect(run(err).status).toBe(503);
  });

  it('other known Prisma errors keep their accepted mapping (P2002 409, P2025 404, others 400 DATABASE_ERROR)', () => {
    expect(run(known('P2002')).status).toBe(409);
    expect(run(known('P2025')).status).toBe(404);
    expect([run(known('P2003')).status, run(known('P2003')).body.error.code]).toEqual([400, 'DATABASE_ERROR']);
  });

  it('anything else -> 500 with a generic body only', () => {
    const { status, body } = run(new Error('postgresql://u:pw@h/db SELECT * FROM "User"'));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
  });
});
