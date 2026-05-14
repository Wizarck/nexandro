import type { ReactNode } from 'react';

/**
 * J6 crisis layout per j6.md "The crisis surface is exempt from the
 * standard top-nav".
 *
 * Routes that begin with `/recall/investigate*` mount on this shell —
 * no header, no sidebar, no global notifications. The shell is the
 * whole viewport so the operator's eye lands on the one decision in
 * front of them.
 *
 * Other M3 surfaces (J7, J8, …) use the standard AppLayout.
 */
export function CrisisLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-ink)',
      }}
      data-testid="crisis-layout"
    >
      <div
        aria-hidden
        style={{
          height: '4px',
          backgroundColor: 'var(--color-destructive)',
        }}
      />
      <main className="flex-1 px-4 py-3 pb-24">{children}</main>
    </div>
  );
}
