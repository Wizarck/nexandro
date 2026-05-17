# @nexandro/label-renderer

EU 1169/2011 compliant label renderer + print dispatch abstraction for nexandro. Per ADR-019 / m2-labels-rendering: a separable npm package that isolates the `@react-pdf/renderer` dependency and the `ipp` print client. Consumed by `apps/api/` for server-side rendering and dispatch.

## Public API

### Renderer

```ts
import { renderLabelToPdf, LabelData } from '@nexandro/label-renderer';

const pdf: Buffer = await renderLabelToPdf({
  recipe: { /* … */ },
  org: { /* … */ },
  locale: 'es',
  pageSize: 'thermal-4x6',
});
```

Three locales are supported in M2: `es`, `en`, `it`. Three page sizes: `a4`, `thermal-4x6`, `thermal-50x80`.

The label has five fixed sections in order: header, ingredient list (Article 18 descending mass), allergen panel (Article 21 emphasized — bold + icon + text always), macro panel (per 100g), footer (net quantity per portion + business address). Cross-contamination disclosure is rendered between the allergen and macro panels when present on the Recipe.

### Print abstraction

Drivers implement `PrintAdapter`:

```ts
import { PrintAdapter, PrintJob, PrintResult } from '@nexandro/label-renderer';

class MyAdapter implements PrintAdapter {
  readonly id = 'my-printer';
  readonly accepts = ['pdf'] as const;
  async print(job: PrintJob): Promise<PrintResult> { /* … */ }
}
```

`apps/api/` registers adapters at boot via `PrintAdapterRegistry`; the dispatcher looks up the adapter from `Org.labelFields.printAdapter.id` at request time.

### Adapters shipped

- **`IppPrintAdapter`** — covers most modern office printers + CUPS print queues. Validates the `PrintAdapter` contract.

Future adapters ship as separate slices (`m2-labels-print-adapter-phomemo`, etc.).

## Compliance gate

Pre-launch external legal review per ADR-019 §Risk gates production exposure of the rendered PDF artefact. The flag `NEXANDRO_LABELS_PROD_ENABLED` is set in `apps/api/` config and defaults to `false` in production until legal sign-off is recorded in the change retro.
