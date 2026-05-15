import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AUTO_FILL_THRESHOLD,
  ConfidenceBandBadge,
  FLAG_FOR_REVIEW_THRESHOLD,
  deriveBand,
} from './ConfidenceBandBadge';

describe('ConfidenceBandBadge', () => {
  it('exposes ADR-034 boundary constants', () => {
    expect(AUTO_FILL_THRESHOLD).toBe(0.85);
    expect(FLAG_FOR_REVIEW_THRESHOLD).toBe(0.6);
  });

  it('derives auto_fill at the boundary', () => {
    expect(deriveBand(0.85)).toBe('auto_fill');
    expect(deriveBand(0.9)).toBe('auto_fill');
  });

  it('derives flag_for_review at the boundary', () => {
    expect(deriveBand(0.6)).toBe('flag_for_review');
    expect(deriveBand(0.84)).toBe('flag_for_review');
  });

  it('derives reject below the flag_for_review boundary', () => {
    expect(deriveBand(0.59)).toBe('reject');
    expect(deriveBand(0)).toBe('reject');
  });

  it('renders auto_fill variant with dot + canonical text', () => {
    render(<ConfidenceBandBadge confidence={0.91} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('data-band')).toBe('auto_fill');
    expect(badge.textContent).toContain('auto-fill');
  });

  it('renders flag_for_review variant with "revisar" text', () => {
    render(<ConfidenceBandBadge confidence={0.74} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('data-band')).toBe('flag_for_review');
    expect(badge.textContent).toContain('revisar');
  });

  it('renders reject variant with "Manual" text and destructive border', () => {
    render(<ConfidenceBandBadge confidence={0.42} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('data-band')).toBe('reject');
    expect(badge.textContent).toContain('Manual');
    expect(badge.style.borderColor).toContain('var(--color-destructive)');
  });

  it('honours an explicit label override', () => {
    render(<ConfidenceBandBadge confidence={0.91} label="auto · 91 %" />);
    expect(screen.getByRole('status').textContent).toContain('auto · 91 %');
  });
});
