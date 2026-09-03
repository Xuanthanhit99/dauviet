import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { MapService } from './map.service';
import { MapFeaturesQueryDto } from './dto/map-query.dto';

@ApiTags('map')
@Controller('map')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Public()
  @Get('features')
  getFeatures(@Query() query: MapFeaturesQueryDto, @Locale() locale: string) {
    return this.map.getFeatures(query, locale);
  }
}
