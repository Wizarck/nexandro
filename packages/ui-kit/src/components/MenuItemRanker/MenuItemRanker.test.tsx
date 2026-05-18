import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MenuItemRanker } from './MenuItemRanker';
import type { DashboardMenuItem } from './MenuItemRanker.types';
import type { MarginReport } from '../MarginPanel';

function makeItem(
  id: string,
  name: string,
  marginPercent: number | null,
  status: MarginReport['status'],
): DashboardMenuItem {
  return {
    menuItemId: id,
    recipeId: `r-${id}`,
    locationId: 'loc-1',
    channel: 'DINE_IN',
    displayLabel: name,
    margin: {
      menuItemId: id,
      organizationId: 'org-1',
      recipeId: `r-${id}`,
      locationId: 'loc-1',
      channel: 'DINE_IN',
      cost: marginPercent === null ? null : 4,
      sellingPrice: 14,
      targetMargin: 0.6,
      marginAbsolute: marginPercent === null ? null : 10,
      marginPercent,
      marginVsTargetPp: marginPercent === null ? null : marginPercent - 0.6,
      status,
      statusLabel:
        status === 'on_target' ? 'On target' :
        status === 'below_target' ? 'Below target' :
        status === 'at_risk' ? 'At risk' : 'Cost unknown',
      warnings: status === 'unknown' ? ['cost_unresolved: …'] : [],
      recipeDiscontinued: false,
      currency: 'EUR',
    },
  };
}

const TOP: DashboardMenuItem[] = [
  makeItem('m1', 'Tagliatelle', 0.72, 'on_target'),
  makeItem('m2', 'Pizza', 0.68, 'on_target'),
];

const BOTTOM: DashboardMenuItem[] = [
  makeItem('m9', 'Carpaccio', 0.32, 'at_risk'),
  makeItem('m10', 'Lasagna', 0.55, 'below_target'),
];

describe('MenuItemRanker', () => {
  it('renders both Top and Bottom sections when both arrays are populated', () => {
    render(<MenuItemRanker top={TOP} bottom={BOTTOM} />);
    expect(screen.getByLabelText('Mejor margen')).toBeInTheDocument();
    expect(screen.getByLabelText('Necesita atención')).toBeInTheDocument();
  });

  it('renders only Top section when bottom is empty', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    expect(screen.getByLabelText('Mejor margen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Necesita atención')).not.toBeInTheDocument();
  });

  it('renders only Bottom section when top is empty', () => {
    render(<MenuItemRanker top={[]} bottom={BOTTOM} />);
    expect(screen.queryByLabelText('Mejor margen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Necesita atención')).toBeInTheDocument();
  });

  it('renders empty-state when both are empty', () => {
    render(<MenuItemRanker top={[]} bottom={[]} emptyStateCopy="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders loading skeleton with aria-busy', () => {
    render(<MenuItemRanker top={[]} bottom={[]} loading />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
  });

  it('each card shows displayLabel + channel + status label', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    expect(screen.getByText('Tagliatelle')).toBeInTheDocument();
    expect(screen.getAllByText('DINE_IN')).toHaveLength(2);
    expect(screen.getAllByText('On target')).toHaveLength(2);
  });

  it('cards are collapsed by default (aria-expanded=false)', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((b) => {
      if (b.getAttribute('aria-expanded') !== null) {
        expect(b).toHaveAttribute('aria-expanded', 'false');
      }
    });
  });

  it('clicking a card expands it inline (aria-expanded toggles)', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    const top1 = screen.getByText('Tagliatelle').closest('button')!;
    fireEvent.click(top1);
    expect(top1).toHaveAttribute('aria-expanded', 'true');
  });

  it('expanded card shows MarginPanel detail (cost / selling price / margin)', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    fireEvent.click(screen.getByText('Tagliatelle').closest('button')!);
    // MarginPanel renders "Cost", "Selling price", "Margin" labels
    expect(screen.getByText(/Cost/)).toBeInTheDocument();
    expect(screen.getByText(/Selling price/)).toBeInTheDocument();
  });

  it('clicking again collapses the card', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    const button = screen.getByText('Tagliatelle').closest('button')!;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('onViewDetails fires with the item when expanded card "Ver detalle de costes →" clicked', () => {
    const onView = vi.fn();
    render(<MenuItemRanker top={TOP} bottom={[]} onViewDetails={onView} />);
    fireEvent.click(screen.getByText('Tagliatelle').closest('button')!);
    fireEvent.click(screen.getByText(/Ver detalle de costes/));
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ menuItemId: 'm1' }));
  });

  it('omits the View-details button when onViewDetails prop is absent', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    fireEvent.click(screen.getByText('Tagliatelle').closest('button')!);
    expect(screen.queryByText(/Ver detalle de costes/)).not.toBeInTheDocument();
  });

  it('cards expose articles labelled by their displayLabel', () => {
    render(<MenuItemRanker top={TOP} bottom={[]} />);
    const article = screen.getByLabelText('Mejor margen').querySelector('article');
    expect(article).toBeInTheDocument();
    const heading = within(article!).getByRole('heading', { name: 'Tagliatelle' });
    expect(heading).toBeInTheDocument();
  });

  it('status colour is paired with status-label text (deuteranopia safe)', () => {
    render(<MenuItemRanker top={[]} bottom={BOTTOM} />);
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('Below target')).toBeInTheDocument();
  });

  it('forwards className for layout overrides', () => {
    const { container } = render(
      <MenuItemRanker top={TOP} bottom={[]} className="ml-8 max-w-2xl" />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region?.className).toMatch(/ml-8/);
  });
});
