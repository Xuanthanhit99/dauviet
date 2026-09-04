import { createHash } from 'crypto';
import { Readable } from 'stream';
import { hashStream } from './checksum.util';

/** Covers spec Phase 05.1 section 26 tests #11/#14: SHA-256 is computed server-side, from a streamed read. */
describe('hashStream', () => {
  it('computes the correct SHA-256 digest of the full stream content', async () => {
    const content = Buffer.from('the quick brown fox jumps over the lazy dog');
    const expected = createHash('sha256').update(content).digest('hex');

    const result = await hashStream(Readable.from([content]));
    expect(result.checksum).toBe(expected);
    expect(result.byteLength).toBe(content.length);
  });

  it('captures the leading bytes for signature checking from the same pass', async () => {
    const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const result = await hashStream(Readable.from([content]), 4);
    expect(result.leadingBytes).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  });

  it('correctly hashes content delivered across many small chunks (streaming, not whole-buffer)', async () => {
    const chunks = Array.from({ length: 50 }, (_, i) => Buffer.from([i]));
    const whole = Buffer.concat(chunks);
    const expected = createHash('sha256').update(whole).digest('hex');

    const result = await hashStream(Readable.from(chunks));
    expect(result.checksum).toBe(expected);
    expect(result.byteLength).toBe(50);
  });

  it('rejects when the underlying stream errors', async () => {
    const errorStream = new Readable({
      read() {
        this.emit('error', new Error('simulated storage read failure'));
      },
    });
    await expect(hashStream(errorStream)).rejects.toThrow('simulated storage read failure');
  });

  it('handles a stream shorter than the requested leading-byte count', async () => {
    const content = Buffer.from([1, 2, 3]);
    const result = await hashStream(Readable.from([content]), 16);
    expect(result.leadingBytes).toEqual(content);
  });
});
