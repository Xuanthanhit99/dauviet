import { BadRequestException } from '@nestjs/common';
import { containsNulByte, NullByteGuardMiddleware } from './null-byte-guard.middleware';

describe('NullByteGuardMiddleware (G12)', () => {
  const run = (req: Partial<{ originalUrl: string; query: unknown; body: unknown }>) => {
    const next = jest.fn();
    new NullByteGuardMiddleware().use({ originalUrl: '/v1/x', query: {}, body: undefined, ...req } as any, {} as any, next);
    return next;
  };

  it('passes ordinary requests through', () => {
    expect(run({ originalUrl: '/v1/search?q=H%E1%BB%99i%20An', query: { q: 'Hội An' }, body: { title: 'Đà Nẵng', shares: [{ amount: '1.00' }] } })).toHaveBeenCalled();
  });

  it.each([
    ['encoded NUL in the path', { originalUrl: '/v1/trips/%00' }],
    ['encoded NUL in the query', { originalUrl: '/v1/search?q=a%00b', query: { q: 'a\u0000b' } }],
    ['NUL in a nested body value', { body: { a: [{ b: 'x\u0000' }] } }],
    ['NUL in a body key', { body: { ['k\u0000']: 1 } }],
  ])('rejects %s with 400', (_label, req) => {
    expect(() => run(req)).toThrow(BadRequestException);
  });

  it('handles very deep bodies without recursion', () => {
    let deep: any = 'end\u0000';
    for (let i = 0; i < 50_000; i++) deep = { a: deep };
    expect(containsNulByte(deep)).toBe(true);
  });
});
