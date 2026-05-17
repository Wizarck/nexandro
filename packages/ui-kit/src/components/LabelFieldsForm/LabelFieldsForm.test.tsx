import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LabelFieldsForm, sanitize } from './LabelFieldsForm';
import type { LabelFieldsFormValues } from './LabelFieldsForm.types';

describe('LabelFieldsForm', () => {
  it('renders all six section legends with empty initialValues', () => {
    render(<LabelFieldsForm onSubmit={vi.fn()} />);
    expect(screen.getByText('Datos del negocio')).toBeInTheDocument();
    expect(screen.getByText('Contacto')).toBeInTheDocument();
    expect(screen.getByText('Dirección postal')).toBeInTheDocument();
    expect(screen.getByText('Marca')).toBeInTheDocument();
    expect(screen.getByText('Tamaño de página')).toBeInTheDocument();
    expect(screen.getByText('Impresora')).toBeInTheDocument();
  });

  it('renders initialValues into the inputs', () => {
    const initial: LabelFieldsFormValues = {
      businessName: 'Trattoria Acme',
      pageSize: 'a4',
      brandMarkUrl: 'https://example.com/logo.svg',
    };
    render(<LabelFieldsForm initialValues={initial} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Nombre del negocio')).toHaveValue('Trattoria Acme');
    expect(screen.getByLabelText('URL del logotipo')).toHaveValue('https://example.com/logo.svg');
    const radio = screen.getByRole('radio', { name: /A4/i });
    expect(radio).toBeChecked();
  });

  it('submits a sanitized DTO on Save', () => {
    const onSubmit = vi.fn();
    render(<LabelFieldsForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Nombre del negocio'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Térmica 4×6/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.businessName).toBe('New Name');
    expect(submitted.pageSize).toBe('thermal-4x6');
  });

  it('surfaces inline errors from the errors prop', () => {
    render(
      <LabelFieldsForm
        onSubmit={vi.fn()}
        errors={{ brandMarkUrl: 'must be a URL', 'postalAddress.city': 'required' }}
      />,
    );
    expect(screen.getByText('must be a URL')).toBeInTheDocument();
    expect(screen.getByText('required')).toBeInTheDocument();
  });

  it('disables Save and changes label while submitting', () => {
    render(<LabelFieldsForm onSubmit={vi.fn()} submitting />);
    const button = screen.getByRole('button', { name: 'Guardando…' });
    expect(button).toBeDisabled();
  });

  it('hides the Save button entirely when disabled', () => {
    render(<LabelFieldsForm onSubmit={vi.fn()} disabled />);
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });
});

describe('sanitize()', () => {
  it('drops empty-string fields', () => {
    const out = sanitize({ businessName: '', brandMarkUrl: 'https://x' });
    expect(out.businessName).toBeUndefined();
    expect(out.brandMarkUrl).toBe('https://x');
  });

  it('drops contactInfo when both inner fields empty', () => {
    const out = sanitize({ contactInfo: { email: undefined, phone: '' } });
    expect(out.contactInfo).toBeUndefined();
  });

  it('drops postalAddress when any field is empty (group invariant)', () => {
    const out = sanitize({
      postalAddress: { street: 'a', city: 'b', postalCode: 'c', country: '' },
    });
    expect(out.postalAddress).toBeUndefined();
  });

  it('preserves printAdapter and strips empty config entries', () => {
    const out = sanitize({
      printAdapter: { id: 'ipp', config: { url: 'ipp://x', queue: '', apiKey: undefined } },
    });
    expect(out.printAdapter).toEqual({ id: 'ipp', config: { url: 'ipp://x' } });
  });
});
