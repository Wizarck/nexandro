/**
 * Shared primitives for the 3 j11 procurement sub-tabs (Sprint 4 refactor —
 * the tabs were originally co-resident in ProcurementScreen.tsx; split into
 * tabs/* to enable parallel iteration on each tab without conflict).
 *
 * Each tab owns its file: PoTab.tsx · GrTab.tsx · ReconciliationTab.tsx.
 */

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 max-w-prose text-sm">{body}</p>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border-strong p-4 text-sm text-mute">
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)"
    >
      Error al cargar: {message}
    </p>
  );
}
