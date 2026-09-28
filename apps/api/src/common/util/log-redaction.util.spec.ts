import { describeErrorForLog, redactForLog, stackForLog } from './log-redaction.util';

describe('log redaction (G12 log privacy)', () => {
  it('masks the password of any URL with credentials, keeping scheme/user/host', () => {
    expect(redactForLog('connect failed postgresql://dauviet:S3cr3t!@db:5432/prod')).toBe('connect failed postgresql://dauviet:***@db:5432/prod');
    expect(redactForLog('redis://default:hunter2@cache:6379')).toBe('redis://default:***@cache:6379');
  });

  it('masks JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsInNpZCI6InMxIn0.abcdefghijklmnopqrstuv';
    expect(redactForLog(`token=${jwt} end`)).toBe('token=[redacted-jwt] end');
    expect(redactForLog('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123')).toBe('Authorization: Bearer [redacted]');
  });

  it('leaves ordinary diagnostics intact', () => {
    expect(redactForLog('deadlock detected on relation "TripMember"')).toBe('deadlock detected on relation "TripMember"');
    expect(redactForLog(undefined)).toBe('');
  });

  it('reduces a Prisma validation error to its reason line (no echoed arguments)', () => {
    const e = new Error('\nInvalid `prisma.tripMemberLocation.create()` invocation:\n\n{\n  data: {\n    latitude: 10.7769421,\n    longitude: "abc"\n  }\n}\n\nArgument `longitude`: Invalid value provided. Expected Float, provided String.');
    e.name = 'PrismaClientValidationError';
    const out = describeErrorForLog(e);
    expect(out).toBe('PrismaClientValidationError: Argument `longitude`: Invalid value provided. Expected Float, provided String.');
    expect(out).not.toContain('10.7769421');
  });

  it('drops a multi-line message (Prisma code frame with arguments) from the logged stack, keeps the frames', () => {
    const e = new Error('Invalid `tx.tripExpense.create()` invocation:\n  data: { occurredOn: new Date("Invalid Date"), payerUserId: "user-secret-id" }\nInvalid value for argument `occurredOn`');
    e.name = 'PrismaClientValidationError';
    const out = stackForLog(e);
    expect(out).not.toContain('user-secret-id');
    expect(out.split('\n')[0]).toBe('PrismaClientValidationError: Invalid value for argument `occurredOn`');
    expect(out.split('\n').slice(1).every((l) => /^\s+at\s/.test(l))).toBe(true);
  });

  it('redacts the stack header and frames but keeps the frames', () => {
    const e = new Error('boom postgresql://u:pw@h/db');
    const out = stackForLog(e);
    expect(out.split('\n')[0]).toBe('boom postgresql://u:***@h/db');
    expect(out).toContain('log-redaction.util.spec');
    expect(out).not.toContain(':pw@');
  });
});
