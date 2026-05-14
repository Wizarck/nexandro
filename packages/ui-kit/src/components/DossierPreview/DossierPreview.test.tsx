import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DossierPreview } from './DossierPreview';

describe('DossierPreview', () => {
  it('renders the iframe with the PDF URL by default', () => {
    render(
      <DossierPreview
        pdfUrl="/api/m3/recall/incidents/inc-1/dossier.pdf"
        incidentCode="IR-2026-0007"
        dispatchedAt="2026-05-13T02:21:00Z"
      />,
    );
    const iframe = screen.getByTestId('dossier-preview-iframe');
    expect(iframe).toHaveAttribute(
      'src',
      '/api/m3/recall/incidents/inc-1/dossier.pdf',
    );
    expect(iframe).toHaveAttribute('title', 'Dossier IR-2026-0007');
  });

  it('renders the plain-text fallback when forceFallback is true', () => {
    render(
      <DossierPreview
        pdfUrl="/x"
        incidentCode="IR-2026-0007"
        dispatchedAt="2026-05-13T02:21:00Z"
        forceFallback
        plainTextFallback={<p>texto plano del dossier</p>}
      />,
    );
    expect(screen.queryByTestId('dossier-preview-iframe')).not.toBeInTheDocument();
    expect(screen.getByText('texto plano del dossier')).toBeInTheDocument();
  });

  it('renders the Descargar PDF link pointing at the same URL', () => {
    render(
      <DossierPreview
        pdfUrl="/api/dossier.pdf"
        incidentCode="IR-2026-0007"
        dispatchedAt="2026-05-13T02:21:00Z"
      />,
    );
    const link = screen.getByRole('link', { name: 'Descargar PDF' });
    expect(link).toHaveAttribute('href', '/api/dossier.pdf');
  });

  it('uses incidentCode as the accessible region name', () => {
    render(
      <DossierPreview
        pdfUrl="/x"
        incidentCode="IR-2026-0007"
        dispatchedAt="2026-05-13T02:21:00Z"
      />,
    );
    expect(screen.getByLabelText('Dossier IR-2026-0007')).toBeInTheDocument();
  });
});
