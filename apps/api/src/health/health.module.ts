import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health module per ADR-HEALTH-EXCLUDED-FROM-API-PREFIX
 * (m3.x-app-bootstrap-and-vps-deploy slice §1.10).
 *
 * Exposes GET /health (mounted at root, NOT under the /api global prefix
 * — see apps/api/src/main.ts setGlobalPrefix exclude rule). Backed by
 * @nestjs/terminus indicator suite: TypeOrmHealthIndicator (DB ping) +
 * MemoryHealthIndicator (heap < 300MB threshold).
 *
 * Consumed by:
 *   - Docker HEALTHCHECK directive in the omnibus Dockerfile.
 *   - apps/api/test/bootstrap.e2e-spec.ts smoke spec.
 *   - Any future cloud load-balancer health probe.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
