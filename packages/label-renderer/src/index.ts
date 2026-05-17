// Public entrypoint — re-exports the stable surface of @nexandro/label-renderer.

export type {
  LabelLocale,
  LabelPageSize,
  LabelPostalAddress,
  LabelContactInfo,
  LabelOrg,
  LabelIngredientRow,
  LabelMacros,
  LabelCrossContamination,
  LabelRecipe,
  LabelData,
} from './types';
export { SUPPORTED_LOCALES, SUPPORTED_PAGE_SIZES } from './types';

export { LOCALE_STRINGS, localizeAllergen } from './locales';
export type { LabelStrings } from './locales';

export { PAGE_GEOMETRY } from './page-sizes';
export type { PageGeometry } from './page-sizes';

// `LabelDocument` is intentionally NOT re-exported from the barrel — it
// transitively loads `@react-pdf/renderer`, an ESM-only dependency that
// breaks Jest CommonJS test runners in consumer packages. Consumers that
// need the React component (e.g. for a client-side preview build) can
// import it directly from `@nexandro/label-renderer/dist/components/LabelDocument`.

// `renderLabelToPdf` defers loading the renderer + LabelDocument until call
// time via dynamic imports — so simply importing the barrel does NOT pull
// `@react-pdf/renderer` into the consumer's module graph.
export { renderLabelToPdf } from './render';

// Print abstraction
export type {
  PrintAdapter,
  PrintJob,
  PrintJobMeta,
  PrintPayloadKind,
  PrintResult,
  PrintErrorPayload,
} from './print/adapter';
export { PrintAdapterRegistry } from './print/registry';
export type { PrintAdapterFactory } from './print/registry';
export { IppPrintAdapter } from './print/ipp-adapter';
export type { IppAdapterConfig } from './print/ipp-adapter';

// Recall dossier renderer per ADR-028 (architecture-m3.md) — reuses the
// dynamic-import discipline of `renderLabelToPdf` so importing the
// barrel does NOT pull `@react-pdf/renderer` into the consumer's module
// graph at import time.
export { renderRecallDossierToPdf } from './dossier';
export type {
  RecallDossierData,
  RecallDossierChronologyEntry,
  RecallDossierTraceNode,
  RecallDossierSignatureBlock,
} from './dossier';
