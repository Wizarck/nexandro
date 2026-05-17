import type {
  PrintAdapter,
  PrintJob,
  PrintPayloadKind,
  PrintResult,
} from './adapter';

/**
 * Generic IPP print adapter — covers most modern office printers, CUPS print
 * queues, and any printer that speaks the Internet Printing Protocol.
 *
 * Configuration via `Org.labelFields.printAdapter.config`:
 *   { url: 'http://printer.local:631/ipp/print', queue?: 'shared', apiKey?: '...' }
 *
 * The adapter accepts PDF payloads (mime: `application/pdf`) and returns the
 * IPP-assigned `job-id` as the result `jobId` when available.
 *
 * Note: pre-launch external legal review (ADR-019 §Risk) does NOT cover the
 * adapter — it gates the rendered PDF artefact, which the dispatcher feeds in.
 */

export interface IppAdapterConfig {
  /** Full IPP printer URL. e.g. `http://printer.local:631/ipp/print`. */
  url: string;
  /** Optional queue name to forward in the IPP job-name attribute. */
  queue?: string;
  /** Optional Bearer API key — included in the underlying HTTP request headers. */
  apiKey?: string;
  /** Per-job timeout in ms. Defaults to 10_000. */
  timeoutMs?: number;
}

/** Minimal contract for the `ipp` npm package's `Printer` constructor + `execute`. */
interface IppPrinter {
  execute(
    operation: 'Print-Job',
    msg: {
      'operation-attributes-tag': {
        'requesting-user-name'?: string;
        'job-name'?: string;
        'document-format': string;
      };
      data: Buffer;
    },
    cb: (err: Error | null, res?: IppResponse) => void,
  ): void;
}

interface IppResponse {
  statusCode?: string;
  'job-attributes-tag'?: {
    'job-id'?: number | string;
  };
}

interface IppModule {
  Printer: new (url: string, options?: { headers?: Record<string, string> }) => IppPrinter;
}

export class IppPrintAdapter implements PrintAdapter {
  readonly id = 'ipp';
  readonly accepts: readonly PrintPayloadKind[] = ['pdf'];

  constructor(
    private readonly config: IppAdapterConfig,
    /** Injection point — defaults to the `ipp` npm package; tests pass a stub. */
    private readonly ippLib?: IppModule,
  ) {}

  async print(job: PrintJob): Promise<PrintResult> {
    if (!job.pdf) {
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: 'IppPrintAdapter requires a PDF payload',
        },
      };
    }

    const lib: IppModule = this.ippLib ?? (await this.loadIpp());

    const printer = new lib.Printer(this.config.url, {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined,
    });

    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'nexandro',
        'job-name': this.config.queue ?? `recipe-${job.meta.recipeId}`,
        'document-format': 'application/pdf',
      },
      data: job.pdf,
    } as const;

    return new Promise<PrintResult>((resolve) => {
      const timeoutMs = this.config.timeoutMs ?? 10_000;
      const timer = setTimeout(() => {
        resolve({
          ok: false,
          error: { code: 'PRINTER_TIMEOUT', message: `IPP request timed out after ${timeoutMs}ms` },
        });
      }, timeoutMs);

      printer.execute('Print-Job', msg, (err, res) => {
        clearTimeout(timer);
        if (err) {
          resolve({
            ok: false,
            error: { code: 'PRINTER_UNREACHABLE', message: err.message },
          });
          return;
        }
        const statusCode = res?.statusCode ?? '';
        if (!statusCode.startsWith('successful')) {
          resolve({
            ok: false,
            error: { code: 'PRINTER_REJECTED', message: `IPP statusCode=${statusCode}` },
          });
          return;
        }
        const jobId = res?.['job-attributes-tag']?.['job-id'];
        resolve({
          ok: true,
          jobId: jobId !== undefined ? String(jobId) : undefined,
        });
      });
    });
  }

  // Late-binding require of `ipp` so that tests can inject a stub via the
  // constructor without ever loading the real library. Wrapped in eval to
  // sidestep `noImplicitAny` and avoid resolving the module at compile time.
  private async loadIpp(): Promise<IppModule> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ipp = require('ipp') as IppModule;
    return ipp;
  }
}
