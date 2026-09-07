import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Single source of truth for the Swagger/OpenAPI document metadata (spec
 * Phase 11 section 78) - shared between the real server boot (`main.ts`)
 * and the offline OpenAPI generation script (`generate-openapi.ts`) so the
 * two can never drift into two different documents describing "the same"
 * API. Tag list kept in sync with every `@ApiTags(...)` value actually used
 * across `apps/api/src/**\/*.controller.ts` - regenerate/verify with:
 *   grep -rhoE "@ApiTags\\('[^']+'\\)" --include="*.controller.ts" apps/api/src | sort -u
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Dau Viet API')
    .setDescription(
      'Living Digital Atlas of Vietnam - backend API contract for web, mobile, and admin clients. ' +
        'See docs/backend/BACKEND_HANDOFF.md for the full handoff contract this document is generated alongside.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('health')
    .addTag('auth')
    .addTag('users')
    .addTag('places')
    .addTag('people')
    .addTag('events')
    .addTag('eras')
    .addTag('dynasties')
    .addTag('territories')
    .addTag('themes')
    .addTag('aliases')
    .addTag('facts')
    .addTag('sources')
    .addTag('citations')
    .addTag('media')
    .addTag('then-now')
    .addTag('stories')
    .addTag('admin/stories')
    .addTag('journeys')
    .addTag('admin/journeys')
    .addTag('editorial')
    .addTag('map')
    .addTag('timeline')
    .addTag('search')
    .addTag('community')
    .addTag('contributions')
    .addTag('admin/contributions')
    .addTag('moderation')
    .addTag('admin/audit')
    .build();
}
