import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { SearchProjectionService } from './search-projection.service';

/**
 * Drains the trigger-fed projection queue on a short interval - the dominant
 * term of the <= 60 s public freshness contract (default 2 s). Redis is not
 * involved: the queue lives in PostgreSQL, so flushing Redis cannot affect
 * projection correctness. On a fresh deploy (no documents at all) it runs one
 * rebuild so search works without a manual step.
 */
@Injectable()
export class SearchProjectionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchProjectionWorker.name);
  private timer?: NodeJS.Timeout;
  private bootstrapTimer?: NodeJS.Timeout;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly projection: SearchProjectionService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit() {
    const { projectionWorkerEnabled, projectionIntervalMs } = this.config.get('search', { infer: true });
    if (!projectionWorkerEnabled) return;

    this.bootstrapTimer = setTimeout(() => {
      this.run(async () => {
        if (await this.projection.isEmpty()) {
          const result = await this.projection.rebuildAll();
          this.logger.log(`initial search projection rebuild: ${result.upserted} documents in ${result.durationMs} ms`);
        }
      });
    }, 500);
    this.bootstrapTimer.unref();

    this.timer = setInterval(() => this.run(async () => void (await this.projection.drain())), projectionIntervalMs);
    this.timer.unref();
  }

  private run(job: () => Promise<void>) {
    if (this.stopped || this.running) return;
    this.running = job()
      .catch((err) => this.logger.warn(`search projection worker tick failed: ${err instanceof Error ? err.message : err}`))
      .finally(() => {
        this.running = null;
      });
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.bootstrapTimer) clearTimeout(this.bootstrapTimer);
    await this.running;
  }
}
