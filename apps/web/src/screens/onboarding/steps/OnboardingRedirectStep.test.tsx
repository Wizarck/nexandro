import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OnboardingRedirectStep } from './OnboardingRedirectStep';

function renderRedirectStep(props: {
  step: 2 | 3 | 4 | 5;
  promise: string;
  targetPath: string;
  targetLabel: string;
}) {
  return render(
    <MemoryRouter initialEntries={[`/onboarding/${props.step}`]}>
      <Routes>
        <Route path="/onboarding/:step" element={<OnboardingRedirectStep {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingRedirectStep', () => {
  it('renders the step number, label and a CTA linking to the target surface', () => {
    renderRedirectStep({
      step: 2,
      promise: 'Crear tu sede principal.',
      targetPath: '/owner-settings/sedes',
      targetLabel: 'Sedes',
    });

    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument();
    expect(screen.getByText('Tu primera sede')).toBeInTheDocument();
    expect(screen.getByText(/Crear tu sede principal\./)).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Continuar a Sedes/ });
    expect(cta).toHaveAttribute('href', '/owner-settings/sedes');
  });

  it('renders a "Saltar este paso" button', () => {
    renderRedirectStep({
      step: 3,
      promise: 'Elegir taxonomía.',
      targetPath: '/owner-settings/catalogo',
      targetLabel: 'Catálogo',
    });

    expect(
      screen.getByRole('button', { name: /Saltar este paso/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Continuar a Catálogo/ }),
    ).toHaveAttribute('href', '/owner-settings/catalogo');
  });
});
