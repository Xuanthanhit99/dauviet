import { MediaType } from '@prisma/client';
import {
  ALLOWED_MEDIA_TYPES_BY_PURPOSE,
  MEDIA_POLICIES,
  assertWithinPolicy,
  matchesSignature,
  safeExtensionFor,
} from './file-signature.util';

/**
 * Covers spec section 66 tests #1/#2/#3: invalid MIME rejected, size limit
 * enforced, and object keys never derive from a client-controlled filename.
 */
describe('assertWithinPolicy', () => {
  it('rejects a MIME type not on the purpose allow-list', () => {
    expect(assertWithinPolicy('avatar', 'application/pdf', 1000)).toMatch(/not allowed/);
  });

  it('rejects a file over the purpose size limit', () => {
    expect(assertWithinPolicy('avatar', 'image/jpeg', 50 * 1024 * 1024)).toMatch(/exceeds/);
  });

  it('accepts a file within policy', () => {
    expect(assertWithinPolicy('photo', 'image/jpeg', 1024)).toBeNull();
  });

  it('never allows PDF/video as an avatar (spec section 31)', () => {
    expect(ALLOWED_MEDIA_TYPES_BY_PURPOSE.avatar).not.toContain(MediaType.DOCUMENT_SCAN);
    expect(ALLOWED_MEDIA_TYPES_BY_PURPOSE.avatar).not.toContain(MediaType.VIDEO);
  });

  it('never offers image/svg+xml on any purpose (spec section 43 - SVG uploads are not accepted)', () => {
    for (const policy of Object.values(ALLOWED_MEDIA_TYPES_BY_PURPOSE)) {
      expect(policy).toBeDefined();
    }
    for (const policy of Object.values(MEDIA_POLICIES)) {
      expect(policy.allowedMimeTypes).not.toContain('image/svg+xml');
    }
  });
});

describe('matchesSignature', () => {
  it('accepts a real JPEG signature', () => {
    expect(matchesSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it('rejects a PNG signature declared as JPEG (mislabeled Content-Type)', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(matchesSignature('image/jpeg', pngBytes)).toBe(false);
  });

  it('accepts a real PDF signature', () => {
    expect(matchesSignature('application/pdf', Buffer.from('%PDF-1.4'))).toBe(true);
  });

  it('rejects an HTML/script payload declared as a PDF', () => {
    expect(matchesSignature('application/pdf', Buffer.from('<script>alert(1)</script>'))).toBe(false);
  });

  it('accepts a real PNG signature', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(matchesSignature('image/png', pngBytes)).toBe(true);
  });
});

describe('safeExtensionFor', () => {
  it('derives the extension from the validated MIME type, never from client input', () => {
    expect(safeExtensionFor('image/jpeg')).toBe('jpg');
    expect(safeExtensionFor('application/pdf')).toBe('pdf');
  });

  it('falls back to a generic extension for an unmapped MIME type rather than trusting a filename', () => {
    expect(safeExtensionFor('application/x-msdownload')).toBe('bin');
  });
});
