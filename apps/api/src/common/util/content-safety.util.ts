import { BadRequestException } from '@nestjs/common';
import { COMMUNITY_ERROR_CODES } from '../errors/community-error-codes';

const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i;
const LINK_PATTERN = /https?:\/\/\S+/gi;
const MAX_LINKS_DEFAULT = 5;

/**
 * Shared user-generated-content guard for CommunityStory content/title,
 * Comment body, and Profile bio (spec Phase 08 section 7/59/60/61).
 *
 * Deliberately reject-on-detection rather than sanitize-in-place, and no
 * `sanitize-html`/`DOMPurify` dependency was added - same reasoning as
 * `story-body.util.ts`'s closed block allow-list (docs/backend/
 * EDITORIAL_CONTENT.md section 4): Community content is plain text/light
 * markdown, not a CMS, so any HTML-tag-shaped substring is refused outright
 * rather than attempting to strip dangerous parts of an open-ended format.
 * This protects every client (Web, native) identically - "React escapes
 * output" is a Web-only property and does not help a React Native or future
 * server-rendered consumer of the same API.
 */
export function assertSafeUserContent(text: string, opts: { maxLinks?: number } = {}): void {
  if (HTML_TAG_PATTERN.test(text)) {
    throw new BadRequestException({
      code: COMMUNITY_ERROR_CODES.COMMUNITY_UNSAFE_CONTENT,
      message: 'Content may not contain HTML markup.',
    });
  }
  const linkCount = text.match(LINK_PATTERN)?.length ?? 0;
  const maxLinks = opts.maxLinks ?? MAX_LINKS_DEFAULT;
  if (linkCount > maxLinks) {
    throw new BadRequestException({
      code: COMMUNITY_ERROR_CODES.COMMUNITY_UNSAFE_CONTENT,
      message: `Content may contain at most ${maxLinks} links.`,
    });
  }
}
