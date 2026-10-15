import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
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
  @Get('diagnostic')
  diagnostic(@Req() req: { headers: Record<string,string|undefined> }) {
    if (process.env.DIAGNOSTIC_TOKEN === undefined || req.headers['x-dauviet-diagnostic-token'] !== process.env.DIAGNOSTIC_TOKEN) {
      throw new UnauthorizedException();
    }
    return this.map.productionDiagnostic();
  }

  @Public()
  @Get('features')
  getFeatures(@Query() query: MapFeaturesQueryDto, @Locale() locale: string) {
    return this.map.getFeatures(query, locale);
  }
}
