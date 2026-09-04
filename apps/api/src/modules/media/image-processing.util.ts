import { createHash } from 'crypto';
import sharp from 'sharp';
import { MediaVariantType } from '@prisma/client';

// Every call processes a distinct image, so sharp's default operation cache
// (keyed on decoded pixel data, ~50MB/20 items/100 files) buys nothing here
// and only accumulates native memory across the life of a long-running
// worker process - disabling it is sharp's own documented recommendation
// for server/worker processes handling varied, non-repeating images.
sharp.cache(false);

export interface GeneratedVariant {
  variantType: MediaVariantType;
  mimeType: string;
  buffer: Buffer;
  width: number;
  height: number;
  checksum: string;
  /** false only for the best-effort AVIF variant - never blocks READY when it fails to generate (spec section 6). */
  mandatory: boolean;
}

/** Raster formats this pipeline will process (spec section 3). Everything else (PDF/audio/video/anything not in this list) skips derivative generation entirely. */
export const PROCESSABLE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

/**
 * Max-dimension targets for the three mandatory variants (spec section 5).
 * `fit: 'inside'` + `withoutEnlargement: true` preserves aspect ratio and
 * never upscales an image past its original size - a 200px-wide original
 * simply never gets a "LARGE" variant bigger than itself.
 */
const MANDATORY_TARGETS: { variantType: MediaVariantType; maxDimension: number }[] = [
  { variantType: MediaVariantType.THUMBNAIL, maxDimension: 320 },
  { variantType: MediaVariantType.MEDIUM, maxDimension: 960 },
  { variantType: MediaVariantType.LARGE, maxDimension: 1920 },
];

/** The optional AVIF derivative's target size - a MEDIUM-ish dimension, deliberately not the largest to keep encode cost bounded (spec section 6). */
const OPTIMIZED_WEB_MAX_DIMENSION = 960;

/**
 * Generates the mandatory THUMBNAIL/MEDIUM/LARGE WebP derivatives (all
 * required - if any throws, the whole call rejects) plus a best-effort AVIF
 * OPTIMIZED_WEB derivative (failures there are swallowed, never rejecting
 * the mandatory set - spec section 6/11).
 *
 * EXIF orientation is honored and normalized via `.rotate()` with no
 * arguments, which auto-rotates from the EXIF orientation tag and then
 * strips it (spec section 7) - a derivative is never upside-down/sideways
 * regardless of how the camera wrote it. Metadata is stripped by omitting
 * `.withMetadata()`: sharp does not carry EXIF/GPS/ICC/camera-serial data
 * into its output unless that method is explicitly called, so public
 * derivatives never carry the original's location/device metadata (spec
 * section 8) - the original object (access-controlled) is untouched.
 */
export async function generateImageVariants(original: Buffer): Promise<GeneratedVariant[]> {
  const mandatory = await Promise.all(
    MANDATORY_TARGETS.map(async ({ variantType, maxDimension }) => {
      const buffer = await sharp(original)
        .rotate()
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const meta = await sharp(buffer).metadata();
      return toVariant(variantType, 'image/webp', buffer, meta, true);
    }),
  );

  const variants = [...mandatory];

  try {
    const buffer = await sharp(original)
      .rotate()
      .resize({ width: OPTIMIZED_WEB_MAX_DIMENSION, height: OPTIMIZED_WEB_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .avif({ quality: 55 })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    variants.push(toVariant(MediaVariantType.OPTIMIZED_WEB, 'image/avif', buffer, meta, false));
  } catch {
    // AVIF encode support/reliability varies by platform build of libvips -
    // never let it block the mandatory set (spec section 6).
  }

  return variants;
}

function toVariant(
  variantType: MediaVariantType,
  mimeType: string,
  buffer: Buffer,
  meta: { width?: number; height?: number },
  mandatory: boolean,
): GeneratedVariant {
  return {
    variantType,
    mimeType,
    buffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    checksum: createHash('sha256').update(buffer).digest('hex'),
    mandatory,
  };
}
