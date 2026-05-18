import { useNavigate } from 'react-router-dom';
import { ONBOARDING_STEPS, type OnboardingStep } from '../OnboardingWizard';

interface PlaceholderProps {
  step: 2 | 3 | 4 | 5;
  /** Short ¿qué hará? promise displayed on the card. */
  promise: string;
  /** Why it's a placeholder today. */
  pending: string;
  /** Optional copy on the primary CTA; default "Saltar al siguiente →". */
  ctaLabel?: string;
}

/**
 * Generic stub for onboarding steps 2-5 that depend on backend capabilities
 * we don't have yet (multi-venue, R8 auth, etc). Renders an honest "qué
 * harás aquí" + "qué falta" + a "Siguiente" button that just advances.
 *
 * This isn't a placeholder-for-the-sake-of-it — it teaches the persona
 * what the next iteration ships, which is itself a feature (sets
 * expectations + lets the Owner skip without anxiety).
 */
export function OnboardingPlaceholderStep({
  step,
  promise,
  pending,
  ctaLabel = 'Saltar al siguiente →',
}: PlaceholderProps) {
  const navigate = useNavigate();
  const info = ONBOARDING_STEPS.find((s) => s.num === step) as OnboardingStep;
  const isLast = step === 5;

  const next = () => {
    if (isLast) {
      navigate('/onboarding/listo');
    } else {
      const nextStep = ONBOARDING_STEPS.find((s) => s.num === step + 1);
      navigate(`/onboarding/${nextStep?.slug ?? 'listo'}`);
    }
  };

  return (
    <div className="space-y-5" aria-label={`Paso ${step}`}>
      <header>
        <p
          className="text-xs uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-mute)' }}
        >
          Paso {step} de 5
        </p>
        <h2 className="font-display mt-1 text-3xl text-ink">{info.label}</h2>
        <p className="mt-1 text-sm text-mute">{info.description}</p>
      </header>

      <div
        role="note"
        className="rounded-md border-l-4 px-5 py-4 text-sm italic"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderLeftColor: 'var(--color-accent)',
          color: 'var(--color-mute)',
          borderColor: 'var(--color-border)',
          borderRightWidth: '1px',
          borderTopWidth: '1px',
          borderBottomWidth: '1px',
        }}
      >
        <p><strong>Qué harás aquí:</strong> {promise}</p>
        <p className="mt-2">
          <strong>Pendiente:</strong> {pending} Saltamos este paso por ahora; te avisaremos en cuanto esté disponible.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs text-mute">No se pierde nada: este paso se activa en cuanto la capacidad esté disponible.</p>
        <button
          type="button"
          onClick={next}
          className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2"
        >
          {isLast ? 'Terminar →' : ctaLabel}
        </button>
      </div>
    </div>
  );
}
