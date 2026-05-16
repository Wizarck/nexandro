import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

const MEMORY_HEAP_THRESHOLD_BYTES = 300 * 1024 * 1024;

/**
 * GET /health — Terminus-backed health endpoint.
 *
 * Mounted at root (excluded from the /api global prefix in main.ts) so
 * Docker HEALTHCHECK + load-balancer probes have a stable, short URL.
 *
 * Returns 200 when all indicators are 'up'; 503 when any is 'down'.
 *
 * Indicators:
 *   - `database` — TypeOrm ping against the shared DataSource.
 *   - `memory_heap` — process heap < 300 MB threshold.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', MEMORY_HEAP_THRESHOLD_BYTES),
    ]);
  }
}
