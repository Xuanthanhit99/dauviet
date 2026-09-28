import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto, SearchSuggestQueryDto } from './dto/search-query.dto';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Public, abuse-sensitive (fuzzy/FTS): tighter than the global default.
  @Public()
  @Throttle({ default: { limit: () => parseInt(process.env.SEARCH_RATE_LIMIT_MAX ?? '60', 10), ttl: 60_000 } })
  @Get()
  search(@Query() query: SearchQueryDto, @Locale() locale: string) {
    return this.searchService.search(query, locale);
  }

  @Public()
  @Get('suggestions')
  suggest(@Query() query: SearchSuggestQueryDto, @Locale() locale: string) {
    return this.searchService.suggest(query.q, locale);
  }
}
