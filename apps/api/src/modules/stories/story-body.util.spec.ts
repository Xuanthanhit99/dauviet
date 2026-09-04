import { BadRequestException } from '@nestjs/common';
import { extractReferencedCitationIds, extractReferencedMediaAssetIds, validateStoryBody } from './story-body.util';

describe('validateStoryBody', () => {
  it('returns an empty array for null/undefined body', () => {
    expect(validateStoryBody(null)).toEqual([]);
    expect(validateStoryBody(undefined)).toEqual([]);
  });

  it('rejects a non-array body', () => {
    expect(() => validateStoryBody({ type: 'paragraph', text: 'hi' })).toThrow(BadRequestException);
  });

  it('accepts a valid mix of allowed block types', () => {
    const body = [
      { type: 'heading', level: 2, text: 'Section' },
      { type: 'paragraph', text: 'Some prose.' },
      { type: 'quote', text: 'A quote.', citationId: 'c1' },
      { type: 'image', mediaAssetId: 'm1', caption: 'A photo' },
      { type: 'source_reference', citationId: 'c1', label: '1' },
      { type: 'entity_reference', entityKind: 'PLACE', entityId: 'p1' },
      { type: 'callout', style: 'disclosure', text: 'Reconstruction illustration.' },
      { type: 'audio', mediaAssetId: 'a1' },
    ];
    expect(validateStoryBody(body)).toEqual(body);
  });

  it('rejects an unrecognized/disallowed block type (e.g. a smuggled html block)', () => {
    expect(() => validateStoryBody([{ type: 'html', raw: '<script>alert(1)</script>' }])).toThrow(BadRequestException);
  });

  it('rejects an iframe/embed-shaped block the same way', () => {
    expect(() => validateStoryBody([{ type: 'iframe', src: 'https://evil.example' }])).toThrow(BadRequestException);
  });

  it('rejects a heading with an invalid level', () => {
    expect(() => validateStoryBody([{ type: 'heading', level: 1, text: 'x' }])).toThrow(BadRequestException);
  });

  it('rejects a paragraph with no text', () => {
    expect(() => validateStoryBody([{ type: 'paragraph' }])).toThrow(BadRequestException);
  });

  it('rejects an image block with no mediaAssetId', () => {
    expect(() => validateStoryBody([{ type: 'image' }])).toThrow(BadRequestException);
  });

  it('rejects an entity_reference with an invalid entityKind', () => {
    expect(() => validateStoryBody([{ type: 'entity_reference', entityKind: 'COMMENT', entityId: 'x' }])).toThrow(BadRequestException);
  });

  it('rejects a callout with an invalid style', () => {
    expect(() => validateStoryBody([{ type: 'callout', style: 'danger', text: 'x' }])).toThrow(BadRequestException);
  });
});

describe('extractReferencedMediaAssetIds / extractReferencedCitationIds', () => {
  it('collects every image/audio mediaAssetId, deduplicated', () => {
    const body = validateStoryBody([
      { type: 'image', mediaAssetId: 'm1' },
      { type: 'image', mediaAssetId: 'm1' },
      { type: 'audio', mediaAssetId: 'm2' },
      { type: 'paragraph', text: 'no media here' },
    ]);
    expect(extractReferencedMediaAssetIds(body)).toEqual(['m1', 'm2']);
  });

  it('collects citationIds from source_reference and quote blocks', () => {
    const body = validateStoryBody([
      { type: 'source_reference', citationId: 'c1' },
      { type: 'quote', text: 'x', citationId: 'c2' },
      { type: 'quote', text: 'y' },
    ]);
    expect(extractReferencedCitationIds(body)).toEqual(['c1', 'c2']);
  });
});
