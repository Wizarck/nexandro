/**
 * Wire-shape mirroring apps/api `LabelFieldsResponseDto` minus `organizationId`.
 * Keep the shape aligned with `apps/api/src/labels/interface/dto/label-fields.dto.ts`
 * — the apps/api class-validator constraints are authoritative.
 */
export const LABEL_PAGE_SIZES = ['a4', 'thermal-4x6', 'thermal-50x80'] as const;
export type LabelPageSize = (typeof LABEL_PAGE_SIZES)[number];

/**
 * Print adapter IDs the SETTINGS UI exposes.
 *
 * - `ipp` — server-side dispatch to a CUPS / IPP printer URL. Unattended.
 * - `system` — client-side print via `window.print()` against the browser's
 *   OS print dialog. The Owner picks any printer their laptop already sees
 *   (USB, AirPrint, network) without nexandro needing to discover anything.
 *
 * `system` deliberately has no `config` fields — the OS dialog handles the
 * selection. Saved value: `{ id: 'system', config: {} }`.
 */
export const PRINT_ADAPTER_IDS = ['ipp', 'system'] as const;
export type PrintAdapterId = (typeof PRINT_ADAPTER_IDS)[number];

export interface LabelFieldsContactInfo {
  email?: string;
  phone?: string;
}

export interface LabelFieldsPostalAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface LabelFieldsPrintAdapter {
  id: string;
  config: Record<string, unknown>;
}

export interface LabelFieldsFormValues {
  businessName?: string;
  contactInfo?: LabelFieldsContactInfo;
  postalAddress?: LabelFieldsPostalAddress;
  brandMarkUrl?: string;
  pageSize?: LabelPageSize;
  printAdapter?: LabelFieldsPrintAdapter;
}

/**
 * Field-keyed error messages. Top-level fields use their key
 * (`businessName`); nested fields use a dotted path (`postalAddress.city`,
 * `printAdapter.config.url`). Maps directly from apps/api class-validator
 * 422 responses where `errors[<dottedKey>] = <message>`.
 */
export type LabelFieldsFormErrors = Partial<Record<string, string>>;

export interface LabelFieldsFormProps {
  initialValues?: LabelFieldsFormValues;
  onSubmit: (values: LabelFieldsFormValues) => void;
  /** Mutation-in-flight indicator. Disables Save and changes its label. */
  submitting?: boolean;
  /** Field-keyed error messages from server (or client zod). */
  errors?: LabelFieldsFormErrors;
  /** Render-only mode: hides Save and disables every input. */
  disabled?: boolean;
}
