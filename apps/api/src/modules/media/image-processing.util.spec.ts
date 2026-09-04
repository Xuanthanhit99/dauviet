import sharp from 'sharp';
import { MediaVariantType } from '@prisma/client';
import { generateImageVariants, PROCESSABLE_IMAGE_MIME_TYPES } from './image-processing.util';

/**
 * Real image bytes, synthetically generated at test time (spec Phase 05.1
 * section 27) - no committed fixture file, and nothing copyrighted or
 * historical. Covers spec section 26 tests #2-#6/#9.
 */
describe('generateImageVariants', () => {
  it('produces the three mandatory THUMBNAIL/MEDIUM/LARGE WebP variants plus a best-effort AVIF OPTIMIZED_WEB variant', async () => {
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer();

    const variants = await generateImageVariants(original);

    const byType = new Map(variants.map((v) => [v.variantType, v]));
    expect(byType.get(MediaVariantType.THUMBNAIL)).toBeDefined();
    expect(byType.get(MediaVariantType.MEDIUM)).toBeDefined();
    expect(byType.get(MediaVariantType.LARGE)).toBeDefined();
    expect(byType.get(MediaVariantType.THUMBNAIL)!.mandatory).toBe(true);
    expect(byType.get(MediaVariantType.MEDIUM)!.mandatory).toBe(true);
    expect(byType.get(MediaVariantType.LARGE)!.mandatory).toBe(true);
    expect(byType.get(MediaVariantType.THUMBNAIL)!.mimeType).toBe('image/webp');

    const avif = byType.get(MediaVariantType.OPTIMIZED_WEB);
    if (avif) {
      expect(avif.mandatory).toBe(false);
      expect(avif.mimeType).toBe('image/avif');
    }
  });

  it('preserves aspect ratio on every mandatory variant', async () => {
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer();

    const variants = await generateImageVariants(original);
    for (const v of variants.filter((x) => x.mandatory)) {
      expect(Math.abs(v.width / v.height - 2)).toBeLessThan(0.05);
    }
  });

  it('never upscales a variant beyond the original dimensions', async () => {
    // A tiny 50x30 original - even the THUMBNAIL (max 320) target must not enlarge it.
    const original = await sharp({ create: { width: 50, height: 30, channels: 3, background: { r: 200, g: 0, b: 0 } } })
      .jpeg()
      .toBuffer();

    const variants = await generateImageVariants(original);
    for (const v of variants.filter((x) => x.mandatory)) {
      expect(v.width).toBeLessThanOrEqual(50);
      expect(v.height).toBeLessThanOrEqual(30);
    }
  });

  it('normalizes EXIF orientation rather than leaving it to the client', async () => {
    // orientation 6 = "rotate 90 CW to display correctly" - a 200x100
    // source with this tag should produce ~100x200 (swapped) derivatives.
    const original = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 5, g: 5, b: 5 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const variants = await generateImageVariants(original);
    const medium = variants.find((v) => v.variantType === MediaVariantType.MEDIUM)!;
    expect(medium.width).toBeLessThan(medium.height);
  });

  it('strips metadata (EXIF/GPS/ICC) from every public derivative', async () => {
    const original = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .withMetadata({ orientation: 1 })
      .toBuffer();

    const variants = await generateImageVariants(original);
    for (const v of variants) {
      const meta = await sharp(v.buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
  });

  it('computes a real SHA-256 checksum per variant', async () => {
    const original = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .jpeg()
      .toBuffer();

    const variants = await generateImageVariants(original);
    for (const v of variants) {
      expect(v.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('rejects (throws) on bytes that are not a decodable image, rather than silently producing garbage', async () => {
    const garbage = Buffer.from('this is not an image at all, just plain text bytes');
    await expect(generateImageVariants(garbage)).rejects.toThrow();
  });

  it('lists only real raster formats as processable (spec section 3) - not PDF/audio/video/SVG', () => {
    expect(PROCESSABLE_IMAGE_MIME_TYPES).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']));
    expect(PROCESSABLE_IMAGE_MIME_TYPES).not.toContain('application/pdf');
    expect(PROCESSABLE_IMAGE_MIME_TYPES).not.toContain('image/gif');
    expect(PROCESSABLE_IMAGE_MIME_TYPES).not.toContain('image/svg+xml');
  });
});
