import { createHash } from 'crypto';
import type { Readable } from 'stream';

export interface StreamDigest {
  /** SHA-256 hex digest of the entire stream (spec Phase 05.1 section 14/15). */
  checksum: string;
  /** The first `leadingByteCount` bytes, captured in the same pass - used for magic-byte signature checking without a second read of the object. */
  leadingBytes: Buffer;
  /** Total bytes actually read - used to cross-check against a HeadObject-reported size. */
  byteLength: number;
}

/**
 * Computes an authoritative SHA-256 digest of a stream in one pass, without
 * ever buffering the whole object in memory (spec section 16) - this is the
 * "streaming hashing" requirement. Also captures the object's leading bytes
 * along the way so the caller can run magic-byte signature validation
 * (`matchesSignature`) from the same read, rather than fetching the object
 * twice. Generic over any Node `Readable` - no S3/MinIO-specific type
 * appears here, so this is trivially unit-testable with `Readable.from(...)`.
 */
export function hashStream(stream: Readable, leadingByteCount = 16): Promise<StreamDigest> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let leadingBytes = Buffer.alloc(0);
    let byteLength = 0;

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      byteLength += chunk.length;
      if (leadingBytes.length < leadingByteCount) {
        leadingBytes = Buffer.concat([leadingBytes, chunk]).subarray(0, leadingByteCount);
      }
    });
    stream.on('end', () => {
      resolve({ checksum: hash.digest('hex'), leadingBytes, byteLength });
    });
    stream.on('error', reject);
  });
}
