import { BadRequestException } from '@nestjs/common';
import { assertSafeUserContent } from './content-safety.util';

describe('assertSafeUserContent', () => {
  it('allows plain text', () => {
    expect(() => assertSafeUserContent('Ky uc dep ve Ha Noi nam 1990.')).not.toThrow();
  });

  it('rejects a <script> payload', () => {
    expect(() => assertSafeUserContent('<script>alert(1)</script>')).toThrow(BadRequestException);
  });

  it('rejects an <img onerror=...> payload', () => {
    expect(() => assertSafeUserContent('<img src=x onerror=alert(1)>')).toThrow(BadRequestException);
  });

  it('rejects a closing tag alone', () => {
    expect(() => assertSafeUserContent('some text </div> more text')).toThrow(BadRequestException);
  });

  it('allows a plain-text angle bracket that is not a tag (e.g. "5 < 10")', () => {
    expect(() => assertSafeUserContent('Gia ve la 5 < 10 nghin dong.')).not.toThrow();
  });

  it('allows up to the default link limit', () => {
    const body = Array.from({ length: 5 }, (_, i) => `http://example.com/${i}`).join(' ');
    expect(() => assertSafeUserContent(body)).not.toThrow();
  });

  it('rejects content exceeding the default link limit', () => {
    const body = Array.from({ length: 6 }, (_, i) => `http://example.com/${i}`).join(' ');
    expect(() => assertSafeUserContent(body)).toThrow(BadRequestException);
  });

  it('respects a custom maxLinks override', () => {
    expect(() => assertSafeUserContent('http://example.com/a', { maxLinks: 0 })).toThrow(BadRequestException);
  });
});
