import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ONBOARDING_STEPS, type OnboardingStep } from '../OnboardingWizard';

interface RedirectProps {
  step: 2 | 3 | 4 | 5;
  /** Short ¿qué hará? promise displayed on the card. */
  promise: string;
  /** Absolute path of the real surface that fulfils this step. */
  targetPath: string;
  /** Spanish label for the surface — e.g. "Sedes", "Catálogo". */
  targetLabel: string;
}

/**
 * Onboarding step that hands the persona off to a real surface that
 * already exists outside the wizard. Replaces the Sprint 1 placeholder for
 * steps 2-5 once Sprint 3 Block B landed the backing screens (sedes /
 * equipo / catálogo / recipes).
 *
 * UX shape: "Aquí harás X → [Continuar a Y →]" + a quieter "Saltar este
 * paso" link that keeps the wizard linear. The CTA opens the target in the
 * same tab (the wizard isn't a modal — leaving it is fine, the persona
 * can re-enter from /onboarding any time).
 */
export function OnboardingRedirectStep({
  step,
  promise,
  targetPath,
  targetLabel,
}: RedirectProps) {
  const navigate = useNavigate();
  const info = ONBOARDING_STEPS.find((s) => s.num === step) as OnboardingStep;
  const isLast = step === 5;

  const skip = () => {
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
        className="rounded-md border-l-4 px-5 py-4 text-sm"
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
        <p>
          <strong>Qué harás aquí:</strong> {promise}
        </p>
        <p className="mt-2">
          Esta capacidad ya vive en <strong>{targetLabel}</strong>. Te llevamos allí — cuando termines, vuelve a <Link to="/onboarding" className="underline underline-offset-2 hover:text-ink">/onboarding</Link> para el siguiente paso.
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={skip}
          className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          Saltar este paso
        </button>
        <Link
          to={targetPath}
          className="inline-flex items-center gap-2 rounded-md border border-(--color-primary) bg-(--color-primary) px-5 py-2.5 text-sm font-semibold text-(--color-on-primary) shadow-sm transition hover:shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2"
        >
          Continuar a {targetLabel}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </div>
  );
}
