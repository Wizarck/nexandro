import { useState, type FormEvent } from 'react';
import { cn } from '../../lib/cn';
import {
  LABEL_PAGE_SIZES,
  PRINT_ADAPTER_IDS,
  type LabelFieldsFormProps,
  type LabelFieldsFormValues,
  type LabelPageSize,
} from './LabelFieldsForm.types';

/**
 * Owner-facing form for the `organizations.label_fields` jsonb config
 * (Wave 1.6). Presentational — the consumer owns the GET/PUT mutations and
 * threads the result back via `initialValues` and `onSubmit`.
 *
 * The shape of `LabelFieldsFormValues` mirrors apps/api `LabelFieldsResponseDto`
 * minus `organizationId`. Inline error messages render below each field from
 * the `errors` prop, which accepts dotted-path keys for nested fields
 * (`postalAddress.city`, `printAdapter.config.url`).
 *
 * Per ADR-026 + Wave 1.13 [3a], the underlying PUT endpoint emits an
 * AGENT_ACTION_FORENSIC audit row only when the request flows through the
 * agent middleware path — direct browser-session saves do not emit an
 * audit row today.
 */
export function LabelFieldsForm({
  initialValues,
  onSubmit,
  submitting = false,
  errors = {},
  disabled = false,
}: LabelFieldsFormProps) {
  const [values, setValues] = useState<LabelFieldsFormValues>(initialValues ?? {});

  const updateField = <K extends keyof LabelFieldsFormValues>(
    key: K,
    value: LabelFieldsFormValues[K],
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const updateContact = (key: 'email' | 'phone', value: string) => {
    setValues((v) => ({
      ...v,
      contactInfo: {
        ...v.contactInfo,
        [key]: value === '' ? undefined : value,
      },
    }));
  };

  const updateAddress = (key: keyof NonNullable<LabelFieldsFormValues['postalAddress']>, value: string) => {
    setValues((v) => ({
      ...v,
      postalAddress: {
        street: v.postalAddress?.street ?? '',
        city: v.postalAddress?.city ?? '',
        postalCode: v.postalAddress?.postalCode ?? '',
        country: v.postalAddress?.country ?? '',
        ...{ [key]: value },
      },
    }));
  };

  const updateAdapterConfig = (key: string, value: string) => {
    setValues((v) => ({
      ...v,
      printAdapter: {
        id: v.printAdapter?.id ?? 'ipp',
        config: {
          ...(v.printAdapter?.config ?? {}),
          [key]: value === '' ? undefined : value,
        },
      },
    }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled || submitting) return;
    onSubmit(sanitize(values));
  };

  const inputCls = cn(
    'block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink',
    'focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
    disabled && 'opacity-60 cursor-not-allowed',
  );
  const fieldsetCls = 'space-y-3 rounded-lg border border-border-subtle p-5';
  const legendCls = 'ml-2 px-2 text-sm font-semibold text-ink';
  const labelCls = 'block text-xs font-medium uppercase tracking-wide text-mute';
  const errorCls = 'text-xs text-(--color-danger-fg) mt-1';

  const fieldError = (key: string): string | undefined => errors[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-label="Configuración de etiquetas">
      {/* 1. Business name */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Datos del negocio</legend>
        <div>
          <label className={labelCls} htmlFor="lf-businessName">Nombre del negocio</label>
          <input
            id="lf-businessName"
            type="text"
            maxLength={200}
            value={values.businessName ?? ''}
            onChange={(e) => updateField('businessName', e.target.value || undefined)}
            className={inputCls}
            aria-invalid={Boolean(fieldError('businessName'))}
          />
          {fieldError('businessName') && <p className={errorCls}>{fieldError('businessName')}</p>}
        </div>
      </fieldset>

      {/* 2. Contact info */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Contacto</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lf-contact-email">Email</label>
            <input
              id="lf-contact-email"
              type="email"
              value={values.contactInfo?.email ?? ''}
              onChange={(e) => updateContact('email', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('contactInfo.email'))}
            />
            {fieldError('contactInfo.email') && <p className={errorCls}>{fieldError('contactInfo.email')}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-contact-phone">Teléfono</label>
            <input
              id="lf-contact-phone"
              type="tel"
              maxLength={40}
              value={values.contactInfo?.phone ?? ''}
              onChange={(e) => updateContact('phone', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('contactInfo.phone'))}
            />
            {fieldError('contactInfo.phone') && <p className={errorCls}>{fieldError('contactInfo.phone')}</p>}
          </div>
        </div>
      </fieldset>

      {/* 3. Postal address */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Dirección postal</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lf-addr-street">Calle</label>
            <input
              id="lf-addr-street"
              type="text"
              maxLength={200}
              value={values.postalAddress?.street ?? ''}
              onChange={(e) => updateAddress('street', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('postalAddress.street'))}
            />
            {fieldError('postalAddress.street') && <p className={errorCls}>{fieldError('postalAddress.street')}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-addr-city">Ciudad</label>
            <input
              id="lf-addr-city"
              type="text"
              maxLength={120}
              value={values.postalAddress?.city ?? ''}
              onChange={(e) => updateAddress('city', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('postalAddress.city'))}
            />
            {fieldError('postalAddress.city') && <p className={errorCls}>{fieldError('postalAddress.city')}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-addr-postal">Código postal</label>
            <input
              id="lf-addr-postal"
              type="text"
              maxLength={20}
              value={values.postalAddress?.postalCode ?? ''}
              onChange={(e) => updateAddress('postalCode', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('postalAddress.postalCode'))}
            />
            {fieldError('postalAddress.postalCode') && <p className={errorCls}>{fieldError('postalAddress.postalCode')}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-addr-country">País</label>
            <input
              id="lf-addr-country"
              type="text"
              maxLength={80}
              value={values.postalAddress?.country ?? ''}
              onChange={(e) => updateAddress('country', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('postalAddress.country'))}
            />
            {fieldError('postalAddress.country') && <p className={errorCls}>{fieldError('postalAddress.country')}</p>}
          </div>
        </div>
      </fieldset>

      {/* 4. Brand mark URL */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Marca</legend>
        <div>
          <label className={labelCls} htmlFor="lf-brandMark">URL del logotipo</label>
          <input
            id="lf-brandMark"
            type="url"
            value={values.brandMarkUrl ?? ''}
            onChange={(e) => updateField('brandMarkUrl', e.target.value || undefined)}
            className={inputCls}
            aria-invalid={Boolean(fieldError('brandMarkUrl'))}
            placeholder="https://…"
          />
          {fieldError('brandMarkUrl') && <p className={errorCls}>{fieldError('brandMarkUrl')}</p>}
          {values.brandMarkUrl && !fieldError('brandMarkUrl') && (
            <img
              src={values.brandMarkUrl}
              alt="Vista previa del logotipo"
              className="mt-2 h-12 w-auto rounded border border-border-subtle"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>
      </fieldset>

      {/* 5. Page size */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Tamaño de página</legend>
        <div role="radiogroup" aria-label="Tamaño de página" className="space-y-1">
          {LABEL_PAGE_SIZES.map((size) => (
            <label key={size} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="lf-pageSize"
                value={size}
                checked={values.pageSize === size}
                onChange={() => updateField('pageSize', size as LabelPageSize)}
                disabled={disabled}
              />
              <span>{labelForPageSize(size)}</span>
            </label>
          ))}
        </div>
        {fieldError('pageSize') && <p className={errorCls}>{fieldError('pageSize')}</p>}
      </fieldset>

      {/* 6. Print adapter */}
      <fieldset className={fieldsetCls} disabled={disabled}>
        <legend className={legendCls}>Impresora</legend>
        <div>
          <label className={labelCls} htmlFor="lf-adapter-id">Tipo de impresora</label>
          <select
            id="lf-adapter-id"
            value={values.printAdapter?.id ?? 'ipp'}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                printAdapter: {
                  id: e.target.value,
                  config: v.printAdapter?.config ?? {},
                },
              }))
            }
            className={inputCls}
            aria-invalid={Boolean(fieldError('printAdapter.id'))}
          >
            {PRINT_ADAPTER_IDS.map((id) => (
              <option key={id} value={id}>
                {id.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="lf-adapter-url">URL del servidor IPP</label>
            <input
              id="lf-adapter-url"
              type="url"
              value={String(values.printAdapter?.config?.url ?? '')}
              onChange={(e) => updateAdapterConfig('url', e.target.value)}
              className={inputCls}
              aria-invalid={Boolean(fieldError('printAdapter.config.url'))}
              placeholder="ipp://printer.local:631/printers/labels"
            />
            {fieldError('printAdapter.config.url') && (
              <p className={errorCls}>{fieldError('printAdapter.config.url')}</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-adapter-queue">Cola</label>
            <input
              id="lf-adapter-queue"
              type="text"
              maxLength={100}
              value={String(values.printAdapter?.config?.queue ?? '')}
              onChange={(e) => updateAdapterConfig('queue', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="lf-adapter-timeout">Timeout (ms)</label>
            <input
              id="lf-adapter-timeout"
              type="number"
              min={100}
              max={60000}
              value={String(values.printAdapter?.config?.timeoutMs ?? '')}
              onChange={(e) => updateAdapterConfig('timeoutMs', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="lf-adapter-key">API key</label>
            <input
              id="lf-adapter-key"
              type="password"
              maxLength={200}
              value={String(values.printAdapter?.config?.apiKey ?? '')}
              onChange={(e) => updateAdapterConfig('apiKey', e.target.value)}
              className={inputCls}
              autoComplete="off"
            />
          </div>
        </div>
      </fieldset>

      {!disabled && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border border-(--color-primary) bg-(--color-primary)',
              'px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) shadow-sm',
              'transition hover:shadow-md hover:brightness-110 active:translate-y-px',
              'focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2 focus:ring-offset-(--color-bg)',
              submitting && 'cursor-wait opacity-70',
            )}
          >
            {submitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border-2 border-(--color-on-primary) border-t-transparent"
                />
                Guardando…
              </>
            ) : (
              <>
                <span aria-hidden="true">💾</span>
                Guardar cambios
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}

function labelForPageSize(size: LabelPageSize): string {
  switch (size) {
    case 'a4':
      return 'A4 (folio)';
    case 'thermal-4x6':
      return 'Térmica 4×6 in';
    case 'thermal-50x80':
      return 'Térmica 50×80 mm';
  }
}

/**
 * Drops empty-string values + objects whose every field is empty so the
 * mutation sends a clean diff. Public for unit tests.
 */
export function sanitize(values: LabelFieldsFormValues): LabelFieldsFormValues {
  const out: LabelFieldsFormValues = {};
  if (values.businessName) out.businessName = values.businessName;
  if (values.contactInfo) {
    const contact: LabelFieldsFormValues['contactInfo'] = {};
    if (values.contactInfo.email) contact.email = values.contactInfo.email;
    if (values.contactInfo.phone) contact.phone = values.contactInfo.phone;
    if (Object.keys(contact).length > 0) out.contactInfo = contact;
  }
  if (values.postalAddress) {
    const a = values.postalAddress;
    if (a.street && a.city && a.postalCode && a.country) out.postalAddress = a;
  }
  if (values.brandMarkUrl) out.brandMarkUrl = values.brandMarkUrl;
  if (values.pageSize) out.pageSize = values.pageSize;
  if (values.printAdapter?.id) {
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values.printAdapter.config ?? {})) {
      if (v !== undefined && v !== '' && v !== null) config[k] = v;
    }
    out.printAdapter = { id: values.printAdapter.id, config };
  }
  return out;
}
