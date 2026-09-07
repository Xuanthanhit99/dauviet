import { Module } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { CountriesController } from './countries.controller';
import { RegionsModule } from '../regions/regions.module';
import { CitiesModule } from '../cities/cities.module';
import { DestinationsModule } from '../destinations/destinations.module';

@Module({
  imports: [RegionsModule, CitiesModule, DestinationsModule],
  providers: [CountriesService],
  controllers: [CountriesController],
  exports: [CountriesService],
})
export class CountriesModule {}
