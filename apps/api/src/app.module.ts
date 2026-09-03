import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { StoriesModule } from './modules/stories/stories.module';
import { JourneysModule } from './modules/journeys/journeys.module';
import { MapModule } from './modules/map/map.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { SearchModule } from './modules/search/search.module';
import { CommentsModule } from './modules/comments/comments.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CommunityModule } from './modules/community/community.module';
import { ContributionsModule } from './modules/contributions/contributions.module';

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
    StoriesModule,
    JourneysModule,
    MapModule,
    TimelineModule,
    SearchModule,
    CommentsModule,
    BookmarksModule,
    ReportsModule,
    CommunityModule,
    ContributionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
