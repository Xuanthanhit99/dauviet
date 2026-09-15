import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PlacesModule } from './modules/places/places.module';
import { PeopleModule } from './modules/people/people.module';
import { EventsModule } from './modules/events/events.module';
import { ErasModule } from './modules/eras/eras.module';
import { DynastiesModule } from './modules/dynasties/dynasties.module';
import { TerritoriesModule } from './modules/territories/territories.module';
import { FactsModule } from './modules/facts/facts.module';
import { SourcesModule } from './modules/sources/sources.module';
import { CitationsModule } from './modules/citations/citations.module';
import { MediaModule } from './modules/media/media.module';
import { ThenNowModule } from './modules/then-now/then-now.module';
import { EditorialModule } from './modules/editorial/editorial.module';
import { StoriesModule } from './modules/stories/stories.module';
import { JourneysModule } from './modules/journeys/journeys.module';
import { MapModule } from './modules/map/map.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { SearchModule } from './modules/search/search.module';
import { CommentsModule } from './modules/comments/comments.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CommunityModule } from './modules/community/community.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { ContributionsModule } from './modules/contributions/contributions.module';
import { AliasesModule } from './modules/aliases/aliases.module';
import { ThemesModule } from './modules/themes/themes.module';
import { CountriesModule } from './modules/countries/countries.module';
import { RegionsModule } from './modules/regions/regions.module';
import { CitiesModule } from './modules/cities/cities.module';
import { DestinationsModule } from './modules/destinations/destinations.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { AccommodationsModule } from './modules/accommodations/accommodations.module';
import { CuisinesModule } from './modules/cuisines/cuisines.module';
import { DishesModule } from './modules/dishes/dishes.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { AttractionsModule } from './modules/attractions/attractions.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { TripsModule } from './modules/trips/trips.module';
import { CostAssumptionsModule } from './modules/cost-assumptions/cost-assumptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        throttlers: [
          {
            ttl: config.get('rateLimit', { infer: true }).ttl * 1000,
            limit: config.get('rateLimit', { infer: true }).max,
          },
        ],
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: { url: config.get('redis', { infer: true }).url },
      }),
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PlacesModule,
    PeopleModule,
    EventsModule,
    ErasModule,
    DynastiesModule,
    TerritoriesModule,
    FactsModule,
    SourcesModule,
    CitationsModule,
    MediaModule,
    ThenNowModule,
    EditorialModule,
    StoriesModule,
    JourneysModule,
    MapModule,
    TimelineModule,
    SearchModule,
    CommentsModule,
    BookmarksModule,
    ReportsModule,
    CommunityModule,
    ModerationModule,
    ContributionsModule,
    AliasesModule,
    ThemesModule,
    // G01 - Global Backend V2 Extension, Global Geography Foundation.
    // DestinationsModule/RegionsModule are self-contained (no cross-module
    // imports); CitiesModule imports DestinationsModule for the
    // `/cities/:slug/destinations` scoped route; CountriesModule imports
    // all three for its own scoped routes. One-directional, no cycles.
    CountriesModule,
    RegionsModule,
    CitiesModule,
    DestinationsModule,
    // G02 - Global Backend V2 Extension, Provider + Licensing Foundation.
    // Entirely geography-independent (spec section 37) - no import
    // relationship to the geography modules above.
    ProvidersModule,
    // G05 - Global Backend V2 Extension, Stay + Food + Activities. Each
    // imports ProvidersModule directly where it needs
    // ProviderRegistryService (Accommodations/Restaurants/Activities);
    // Cuisines/Dishes/Attractions are pure first-party knowledge with no
    // provider layer. One-directional (G05 -> G02/G01), no cycles.
    AccommodationsModule,
    CuisinesModule,
    DishesModule,
    RestaurantsModule,
    AttractionsModule,
    ActivitiesModule,
    // G06 - Global Backend V2 Extension, Trip Planner + Cost Engine. Private,
    // owner-scoped planning data - geography-independent at the module-wiring
    // level (origin/destination lookups go through PrismaService directly,
    // not through DestinationsModule/CountriesModule's own services).
    TripsModule,
    CostAssumptionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
