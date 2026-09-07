import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Escape hatch for tooling that boots the full Nest DI graph without a
    // reachable database - currently only the OpenAPI generation script
    // (spec Phase 11 section 77/78: "OpenAPI generation requires no live
    // DB"). Never set in a real server boot; `main.ts` never sets this and
    // ordinary `docker compose`/production environments never define it, so
    // a live server still fails fast on an unreachable database exactly as
    // before.
    if (process.env.SKIP_DB_CONNECT === 'true') {
      this.logger.warn('SKIP_DB_CONNECT=true - skipping database connection. Only valid for offline tooling (e.g. OpenAPI generation), never a real server boot.');
      return;
    }
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
