/**
 * MIME/size policy + magic-byte signature validation (spec Phase 05 section
 * 14). Never trusts a filename extension or a client-declared Content-Type
 * alone - `matchesSignature` inspects the actual leading bytes of a buffer.
 * No external dependency (no `file-type`/`sharp`) - hand-written signature
 * table for the formats this API accepts, verified against the well-known
 * public magic-byte constants for each format.
 *
 * Where the backend never receives file bytes at all (a client uploading
 * directly to S3 via a presigned PUT), signature checking cannot run at
 * request time - `MediaService.confirmUpload` calls it against a small
 * range-read of the object after upload instead (see docs/backend/
 * MEDIA_ARCHITECTURE.md "MIME validation" for the honest limits of this).
 */
import { MediaType } from '@prisma/client';

export type UploadPurpose = 'photo' | 'archival' | 'document' | 'audio' | 'video' | 'avatar';

interface MediaPolicy {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

/**
 * Per-purpose allow-lists and size caps (spec section 15). SVG is
 * deliberately never in any allow-list (spec section 43 - "simplest safe MVP
 * option: do not accept community SVG uploads"; no controlled Admin SVG
 * sanitization pipeline exists in this codebase, so it is not offered at all
 * rather than half-implemented). Executables, scripts, and HTML are never
 * accepted anywhere.
 */
export const MEDIA_POLICIES: Record<UploadPurpose, MediaPolicy> = {
  photo: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'],
    maxSizeBytes: 25 * 1024 * 1024,
  },
  archival: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'],
    maxSizeBytes: 100 * 1024 * 1024,
  },
  document: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'],
    maxSizeBytes: 200 * 1024 * 1024,
  },
  audio: {
    allowedMimeTypes: ['audio/mpeg', 'audio/wav'],
    maxSizeBytes: 100 * 1024 * 1024,
  },
  video: {
    allowedMimeTypes: ['video/mp4'],
    maxSizeBytes: 500 * 1024 * 1024,
  },
  avatar: {
    // Spec section 31: no PDF/video/audio as an avatar, deliberately a
    // stricter allow-list and cap than the general photo policy.
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
};

/** MediaType values that make sense for each purpose - used to reject e.g. `type: VIDEO` on an `avatar` upload. */
export const ALLOWED_MEDIA_TYPES_BY_PURPOSE: Record<UploadPurpose, MediaType[]> = {
  photo: [MediaType.PHOTO, MediaType.ILLUSTRATION, MediaType.RECONSTRUCTION],
  archival: [MediaType.ARCHIVAL_PHOTO, MediaType.MAP, MediaType.ILLUSTRATION, MediaType.RECONSTRUCTION],
  document: [MediaType.DOCUMENT_SCAN],
  audio: [MediaType.AUDIO],
  video: [MediaType.VIDEO],
  avatar: [MediaType.PHOTO],
};

export function assertWithinPolicy(purpose: UploadPurpose, mimeType: string, sizeBytes: number): string | null {
  const policy = MEDIA_POLICIES[purpose];
  if (!policy.allowedMimeTypes.includes(mimeType)) {
    return `MIME type ${mimeType} is not allowed for purpose ${purpose}. Allowed: ${policy.allowedMimeTypes.join(', ')}.`;
  }
  if (sizeBytes > policy.maxSizeBytes) {
    return `File size ${sizeBytes} bytes exceeds the ${policy.maxSizeBytes}-byte limit for purpose ${purpose}.`;
  }
  return null;
}

type SignatureCheck = (buf: Buffer) => boolean;

const SIGNATURES: Record<string, SignatureCheck> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  'image/webp': (b) =>
    b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
  'image/tiff': (b) =>
    b.length >= 4 &&
    ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)),
  'application/pdf': (b) => b.length >= 5 && b.slice(0, 5).toString('ascii') === '%PDF-',
  'audio/mpeg': (b) =>
    b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)),
  'audio/wav': (b) =>
    b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WAVE',
  'video/mp4': (b) => b.length >= 12 && b.slice(4, 8).toString('ascii') === 'ftyp',
};

/**
 * Returns true only if `buffer`'s leading bytes match the known signature for
 * `declaredMimeType`. Returns true (does not block) for a MIME type this
 * table has no signature for, rather than falsely rejecting a legitimate
 * format we simply haven't hand-coded a check for - the allow-list in
 * `MEDIA_POLICIES` is the hard gate; this is defense in depth against a
 * mislabeled Content-Type, not the only gate.
 */
export function matchesSignature(declaredMimeType: string, buffer: Buffer): boolean {
  const check = SIGNATURES[declaredMimeType];
  if (!check) return true;
  return check(buffer);
}

/** Safe, allow-listed extension for a MIME type - never taken from the client's filename verbatim (spec section 10). */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
};

export function safeExtensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}
