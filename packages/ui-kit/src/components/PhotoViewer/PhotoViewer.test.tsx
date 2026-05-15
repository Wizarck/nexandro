import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhotoViewer } from './PhotoViewer';
import type { BoundingBox } from './PhotoViewer.types';

const SAMPLE_BOXES: BoundingBox[] = [
  { fieldName: 'supplier', x: 10, y: 10, w: 100, h: 30, label: 'Proveedor' },
  { fieldName: 'total', x: 200, y: 50, w: 80, h: 30, label: 'Total' },
];

describe('PhotoViewer', () => {
  it('renders the fallback when photoUrl is null', () => {
    render(<PhotoViewer photoUrl={null} boundingBoxes={[]} />);
    expect(screen.getByText('Imagen no se pudo cargar')).toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('renders the fallback when photoUrl is empty string', () => {
    render(<PhotoViewer photoUrl="" boundingBoxes={[]} />);
    expect(screen.getByText('Imagen no se pudo cargar')).toBeInTheDocument();
  });

  it('fires onReupload when the re-upload link is clicked', () => {
    const onReupload = vi.fn();
    render(
      <PhotoViewer photoUrl={null} boundingBoxes={[]} onReupload={onReupload} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /re-subir/ }));
    expect(onReupload).toHaveBeenCalled();
  });

  it('renders the img + toolbar when photoUrl is provided', () => {
    render(
      <PhotoViewer
        photoUrl="https://example.test/p.jpg"
        boundingBoxes={SAMPLE_BOXES}
      />,
    );
    expect(screen.getByAltText('Foto a revisar')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Visor de foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alejar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotar' })).toBeInTheDocument();
  });

  it('exposes per-box accessible regions with fieldName + highlight state', () => {
    render(
      <PhotoViewer
        photoUrl="https://example.test/p.jpg"
        boundingBoxes={SAMPLE_BOXES}
        highlightedField="total"
      />,
    );
    const region = screen
      .getAllByRole('region')
      .find((r) => r.getAttribute('data-field-name') === 'total');
    expect(region).toBeTruthy();
    expect(region!.hasAttribute('data-highlighted')).toBe(true);
    expect(region!.getAttribute('data-highlighted')).toBe('true');
    const other = screen
      .getAllByRole('region')
      .find((r) => r.getAttribute('data-field-name') === 'supplier');
    expect(other!.getAttribute('data-highlighted')).toBe('false');
  });

  it('fires onDownload when the toolbar download button is clicked', () => {
    const onDownload = vi.fn();
    render(
      <PhotoViewer
        photoUrl="https://example.test/p.jpg"
        boundingBoxes={[]}
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Descargar original' }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('disables the download button when no onDownload handler is provided', () => {
    render(
      <PhotoViewer photoUrl="https://example.test/p.jpg" boundingBoxes={[]} />,
    );
    expect(
      screen
        .getByRole('button', { name: 'Descargar original' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});
