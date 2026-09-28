/**
 * G12 log privacy (defense in depth). Unexpected errors are logged verbatim by
 * AllExceptionsFilter so operators can diagnose them - but an error message can
 * carry things that must never reach a log sink: a connection string with its
 * password (driver/connect errors), a bearer JWT, or - for Prisma's client-side
 * validation errors - a code frame echoing the query arguments (which may be a
 * member's coordinates or email). This keeps the diagnosis and drops those.
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g;
const BEARER = /\b(Bearer\s+)[\w.~+/-]{16,}=*/gi;

export function redactForLog(text: string | undefined | null): string {
  if (!text) return '';
  return text.replace(URL_CREDENTIALS, '$1:***@').replace(JWT, '[redacted-jwt]').replace(BEARER, '$1[redacted]');
}

/**
 * Prisma's PrismaClientValidationError message is a multi-line code frame that
 * quotes the invocation's arguments; its last non-empty line is the actual
 * reason ("Argument `x`: Invalid value provided...") without argument values.
 */
export function describeErrorForLog(error: Error): string {
  // Every PrismaClient* error message has the same layout (invocation + code frame, reason last).
  if (error.name.startsWith('PrismaClient')) {
    const lines = error.message.split('\n').map((l) => l.trim()).filter(Boolean);
    return `${error.name}: ${redactForLog(lines[lines.length - 1] ?? 'invalid invocation')}`;
  }
  return redactForLog(error.message);
}

/**
 * Stack frames are kept (file:line is what makes an error fixable). Everything before the first
 * `at ...` frame is the message - for Prisma errors a multi-line code frame that can quote query
 * arguments - so it is replaced by the same safe description as the log line itself.
 */
export function stackForLog(error: Error): string {
  if (!error.stack) return '';
  const frames = error.stack.split('\n').filter((line) => /^\s+at\s/.test(line));
  return [describeErrorForLog(error), ...frames.map((f) => redactForLog(f))].join('\n');
}
