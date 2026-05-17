import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';

import { EmailDispatchFactory } from './email-dispatch.factory';
import { EmailFailureAlerter } from './email-failure-alerter';
import { EMAIL_DISPATCH_SERVICE } from './email-dispatch.service.interface';

/**
 * EmailDispatchModule per ADR-039 + ADR-EMAIL-PROVIDER-FACTORY.
 *
 * Exports a single DI token `EMAIL_DISPATCH_SERVICE` resolved by
 * `EmailDispatchFactory.onModuleInit()` from the
 * `NEXANDRO_EMAIL_PROVIDER` env. Downstream consumers (slices #13
 * recall dossier, #15 APPCC export, #19 budget alerts) inject this
 * token via:
 *
 *     constructor(
 *       @Inject(EMAIL_DISPATCH_SERVICE)
 *       private readonly emailDispatch: EmailDispatchService,
 *     ) {}
 *
 * The factory is also exported so future advanced consumers (e.g. a
 * per-org override layer) can rebuild a different adapter on demand.
 *
 * `EmailFailureAlerter` is published so future M2/M3 `notifications`
 * BC wiring can swap a real `NotificationsService` into it via DI.
 */
@Module({
  providers: [
    EmailDispatchFactory,
    EmailFailureAlerter,
    {
      // The factory IS the service — see ADR note inside the factory
      // file. Using `useExisting` rebinds the symbol token to the same
      // singleton, sidestepping the `useFactory`-vs-`onModuleInit`
      // lifecycle race.
      provide: EMAIL_DISPATCH_SERVICE,
      useExisting: EmailDispatchFactory,
    },
  ],
  exports: [EMAIL_DISPATCH_SERVICE, EmailDispatchFactory, EmailFailureAlerter],
})
export class EmailDispatchModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailDispatchModule.name);

  constructor(private readonly factory: EmailDispatchFactory) {}

  async onApplicationBootstrap(): Promise<void> {
    // Smoke probe per task 11.2 — verifyConnection() against the
    // configured provider. Failures are logged but DO NOT block boot:
    // the API stays up with degraded email so other surfaces keep
    // working, and the next dispatch attempt surfaces the failure via
    // the alerter cascade.
    try {
      const svc = this.factory.getService();
      const ok = await svc.verifyConnection();
      if (!ok) {
        this.logger.warn(
          'EmailDispatchService.verifyConnection() returned false — boot continues with degraded email',
        );
      }
    } catch (err) {
      this.logger.warn(
        `EmailDispatchService.verifyConnection() threw: ${(err as Error).message}`,
      );
    }
  }
}
