import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListCommunityStoriesQueryDto } from './community-story.dto';

/**
 * Phase 11 contract-hardening (spec sections 13/14/89 test #31): an
 * unsupported `sort`/`type` query value must be rejected with a validation
 * error, not silently coerced to a default order or passed through
 * unchecked. Exercises the actual DTO class-validator wiring the global
 * `ValidationPipe` runs in production, not a hand-rolled check.
 */
describe('ListCommunityStoriesQueryDto', () => {
  it('accepts a supported sort value', async () => {
    const dto = plainToInstance(ListCommunityStoriesQueryDto, { sort: 'HELPFUL' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported sort value', async () => {
    const dto = plainToInstance(ListCommunityStoriesQueryDto, { sort: 'MOST_CONTROVERSIAL' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
  });

  it('rejects a type value outside CommunityStoryType', async () => {
    const dto = plainToInstance(ListCommunityStoriesQueryDto, { type: 'NOT_A_REAL_TYPE' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects a limit above the enforced maximum', async () => {
    const dto = plainToInstance(ListCommunityStoriesQueryDto, { limit: 500 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
