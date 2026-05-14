import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyStateCard } from './EmptyStateCard';

describe('EmptyStateCard', () => {
  it('renders the title', () => {
    render(<EmptyStateCard title="Sin actividad en los últimos 30 días" />);
    expect(
      screen.getByText('Sin actividad en los últimos 30 días'),
    ).toBeInTheDocument();
  });

  it('renders the body when supplied', () => {
    render(
      <EmptyStateCard
        title="Sin actividad"
        body="Tu primera capacidad AI será visible aquí en cuanto se ejecute"
      />,
    );
    expect(
      screen.getByText(/Tu primera capacidad AI será visible/),
    ).toBeInTheDocument();
  });

  it('renders the CTA link when ctaHref + ctaLabel both supplied', () => {
    render(
      <EmptyStateCard
        title="Sin actividad"
        ctaHref="/owner-settings#ai-providers"
        ctaLabel="Configurar AI providers →"
      />,
    );
    const link = screen.getByRole('link', { name: /Configurar AI providers/ });
    expect(link).toHaveAttribute('href', '/owner-settings#ai-providers');
  });

  it('omits the CTA link when ctaHref or ctaLabel is missing', () => {
    render(<EmptyStateCard title="Sin actividad" ctaHref="/x" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('carries role="status" so screen readers announce the empty state', () => {
    render(<EmptyStateCard title="Sin actividad" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
