import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

const PROBE_TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('probe timeout')), ms).unref())]);
}

/**
 * Readiness probe. G12 semantics:
 * - PostgreSQL is the authority for every domain: if it is unreachable the API is NOT ready -> 503.
 * - Redis carries only BullMQ jobs (media derivatives, knowledge ingestion). Auth, trips, location,
 *   expenses, search and map keep working without it (proven by G12 Path D), so a Redis outage is
 *   reported as `status: "degraded"` with HTTP 200 rather than taking the API out of rotation.
 * - Each probe is time-boxed; the Redis probe is a real PING (the previous check awaited an
 *   already-resolved connection promise and kept reporting "ok" while Redis was down).
 * - Optional external integrations (providers, email, OAuth, object storage) are not probed.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('media-processing') private readonly mediaQueue: Queue,
  ) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = { api: 'ok' };

    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      const client = await withTimeout(this.mediaQueue.client, PROBE_TIMEOUT_MS);
      await withTimeout(client.ping(), PROBE_TIMEOUT_MS);
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const timestamp = new Date().toISOString();
    if (checks.database !== 'ok') {
      throw new ServiceUnavailableException({ code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable - not ready.', errors: { status: 'unavailable', checks, timestamp } });
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    return { status: healthy ? 'ok' : 'degraded', checks, timestamp };
  }
}
