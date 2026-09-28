import { Injectable } from '@nestjs/common';

const WINDOW = 500;

interface RouteStats {
  total: number;
  zeroResults: number;
  errors: number;
  latencies: number[];
}

/**
 * Minimal operational metrics (G11 spec 82/83): latency, result count, zero-result
 * rate and errors per route, in memory only. Deliberately stores NO query text, user
 * id, IP or any per-user data - there is no search-history or profiling here.
 */
@Injectable()
export class SearchMetricsService {
  private readonly routes = new Map<string, RouteStats>();

  record(route: string, durationMs: number, resultCount: number, isError: boolean): void {
    const s = this.routes.get(route) ?? { total: 0, zeroResults: 0, errors: 0, latencies: [] };
    s.total += 1;
    if (isError) s.errors += 1;
    else if (resultCount === 0) s.zeroResults += 1;
    s.latencies.push(durationMs);
    if (s.latencies.length > WINDOW) s.latencies.shift();
    this.routes.set(route, s);
  }

  private percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    return Number(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(2));
  }

  snapshot() {
    const out: Record<string, unknown> = {};
    for (const [route, s] of this.routes) {
      const sorted = [...s.latencies].sort((a, b) => a - b);
      out[route] = {
        total: s.total,
        zeroResultRate: s.total ? Number((s.zeroResults / s.total).toFixed(4)) : 0,
        errors: s.errors,
        p50Ms: this.percentile(sorted, 50),
        p95Ms: this.percentile(sorted, 95),
        sampleSize: sorted.length,
      };
    }
    return out;
  }
}
