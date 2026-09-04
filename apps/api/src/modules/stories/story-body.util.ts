import { BadRequestException } from '@nestjs/common';

/**
 * Story body content contract (spec Phase 06 section 6/7). A structured,
 * server-validated block array - never raw/trusted HTML from Admin, and
 * never rendered as HTML server-side. Safe for web and native clients
 * alike (each platform renders its own block components), inherently
 * immune to stored-XSS (there is no "html" block type - anything that
 * isn't one of the allow-listed block shapes below is rejected outright,
 * not sanitized-and-kept).
 *
 * This is intentionally NOT sanitized Markdown - Markdown-to-HTML rendering
 * still requires a sanitization pass at the presentation boundary and this
 * codebase has no HTML sanitizer dependency to do that safely. A closed
 * block schema sidesteps the whole class of "did we sanitize correctly"
 * risk: the server can enumerate every allowed shape.
 */
export type StoryBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string; attribution?: string; citationId?: string }
  | { type: 'image'; mediaAssetId: string; caption?: string }
  | { type: 'source_reference'; citationId: string; label?: string }
  | { type: 'entity_reference'; entityKind: 'PLACE' | 'PERSON' | 'EVENT' | 'ERA' | 'TERRITORY'; entityId: string; text?: string }
  | { type: 'callout'; style: 'info' | 'warning' | 'disclosure'; text: string }
  | { type: 'audio'; mediaAssetId: string; caption?: string };

const ALLOWED_BLOCK_TYPES = new Set<StoryBlock['type']>([
  'heading',
  'paragraph',
  'quote',
  'image',
  'source_reference',
  'entity_reference',
  'callout',
  'audio',
]);

const ENTITY_KINDS = new Set(['PLACE', 'PERSON', 'EVENT', 'ERA', 'TERRITORY']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function assertBlock(block: unknown, index: number): asserts block is StoryBlock {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    throw new BadRequestException(`Story body block ${index} must be an object.`);
  }
  const b = block as Record<string, unknown>;
  if (typeof b.type !== 'string' || !ALLOWED_BLOCK_TYPES.has(b.type as StoryBlock['type'])) {
    // Deliberately rejects anything not on the allow-list, including any
    // "html"/"script"/"iframe"/"embed"-shaped block a client might send -
    // there is no escape hatch to arbitrary markup (spec section 7).
    throw new BadRequestException(`Story body block ${index} has an unrecognized or disallowed type: ${String(b.type)}.`);
  }

  switch (b.type) {
    case 'heading':
      if (![2, 3, 4].includes(b.level as number)) throw new BadRequestException(`Story body block ${index}: heading level must be 2, 3, or 4.`);
      if (!isNonEmptyString(b.text)) throw new BadRequestException(`Story body block ${index}: heading requires text.`);
      break;
    case 'paragraph':
      if (!isNonEmptyString(b.text)) throw new BadRequestException(`Story body block ${index}: paragraph requires text.`);
      break;
    case 'quote':
      if (!isNonEmptyString(b.text)) throw new BadRequestException(`Story body block ${index}: quote requires text.`);
      break;
    case 'image':
    case 'audio':
      if (!isNonEmptyString(b.mediaAssetId)) throw new BadRequestException(`Story body block ${index}: ${b.type} requires mediaAssetId.`);
      break;
    case 'source_reference':
      if (!isNonEmptyString(b.citationId)) throw new BadRequestException(`Story body block ${index}: source_reference requires citationId.`);
      break;
    case 'entity_reference':
      if (!ENTITY_KINDS.has(b.entityKind as string)) throw new BadRequestException(`Story body block ${index}: entity_reference has an invalid entityKind.`);
      if (!isNonEmptyString(b.entityId)) throw new BadRequestException(`Story body block ${index}: entity_reference requires entityId.`);
      break;
    case 'callout':
      if (!['info', 'warning', 'disclosure'].includes(b.style as string)) throw new BadRequestException(`Story body block ${index}: callout has an invalid style.`);
      if (!isNonEmptyString(b.text)) throw new BadRequestException(`Story body block ${index}: callout requires text.`);
      break;
  }
}

/** Validates a Story body submitted by an editor. Throws on the first invalid/disallowed block; never silently drops or coerces one. */
export function validateStoryBody(input: unknown): StoryBlock[] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new BadRequestException('Story body must be an array of content blocks.');
  }
  input.forEach((block, i) => assertBlock(block, i));
  return input as StoryBlock[];
}

/** Every citationId referenced by a source_reference/quote block - used to validate they resolve to real StoryCitation links. */
export function extractReferencedCitationIds(blocks: StoryBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    if (b.type === 'source_reference') ids.add(b.citationId);
    if (b.type === 'quote' && b.citationId) ids.add(b.citationId);
  }
  return Array.from(ids);
}

/** Every mediaAssetId referenced inline (spec section 14) - used to validate each is READY before publication. */
export function extractReferencedMediaAssetIds(blocks: StoryBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    if (b.type === 'image' || b.type === 'audio') ids.add(b.mediaAssetId);
  }
  return Array.from(ids);
}
