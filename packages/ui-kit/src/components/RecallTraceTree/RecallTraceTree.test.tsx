import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecallTraceTree } from './RecallTraceTree';
import type { TraceNode } from './types';

const LOT_X = '22222222-2222-4222-8222-222222222222';
const RECIPE_R = '33333333-3333-4333-8333-333333333333';
const MENU_M = '44444444-4444-4444-8444-444444444444';

const threeLevelTree: TraceNode = {
  id: LOT_X,
  kind: 'lot',
  label: 'Lote ABC123',
  children: [
    {
      id: RECIPE_R,
      kind: 'recipe',
      label: 'Receta Tomate',
      children: [
        {
          id: MENU_M,
          kind: 'menu-item',
          label: 'Plato Lasaña',
          children: [],
        },
      ],
    },
  ],
};

describe('RecallTraceTree', () => {
  it('renders a single <ul role="tree"> with role="treeitem" entries (NOT nested cards)', () => {
    render(
      <RecallTraceTree
        tree={threeLevelTree}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    const ul = screen.getByRole('tree');
    expect(ul.tagName).toBe('UL');

    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute('aria-level')).toBe('1');
    expect(items[1]?.getAttribute('aria-level')).toBe('2');
    expect(items[2]?.getAttribute('aria-level')).toBe('3');
  });

  it('renders the kind badges + labels in document order', () => {
    render(
      <RecallTraceTree
        tree={threeLevelTree}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Lote ABC123')).toBeInTheDocument();
    expect(screen.getByText('Receta Tomate')).toBeInTheDocument();
    expect(screen.getByText('Plato Lasaña')).toBeInTheDocument();
  });

  it('renders the muted "profundidad excedida" eyebrow on depthExceeded leaves', () => {
    const cappedTree: TraceNode = {
      ...threeLevelTree,
      children: [
        {
          ...threeLevelTree.children[0]!,
          depthExceeded: true,
          children: [],
        },
      ],
    };

    render(
      <RecallTraceTree
        tree={cappedTree}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/profundidad excedida/i),
    ).toBeInTheDocument();
  });

  it('renders quantityBadge when present', () => {
    const treeWithBadge: TraceNode = {
      ...threeLevelTree,
      quantityBadge: '2.4 kg',
    };

    render(
      <RecallTraceTree
        tree={treeWithBadge}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('2.4 kg')).toBeInTheDocument();
  });

  it('invokes onModeChange with "reverse" when the reverse chip is clicked', () => {
    const onModeChange = vi.fn();
    render(
      <RecallTraceTree
        tree={threeLevelTree}
        mode="forward"
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(screen.getByText(/Atrás/i));

    expect(onModeChange).toHaveBeenCalledWith('reverse');
  });

  it('renders the empty-state hint when tree is null and not loading', () => {
    render(
      <RecallTraceTree tree={null} mode="forward" onModeChange={vi.fn()} />,
    );

    expect(
      screen.getByText(/Selecciona un lote o un anclaje/i),
    ).toBeInTheDocument();
  });

  it('renders the skeleton when tree is null and loading is true', () => {
    render(
      <RecallTraceTree
        tree={null}
        mode="forward"
        onModeChange={vi.fn()}
        loading
      />,
    );

    expect(screen.getByText(/Cargando árbol/i)).toBeInTheDocument();
  });

  it('renders the root with empty children as a single treeitem (no synthetic empty rows)', () => {
    const onlyRoot: TraceNode = {
      id: LOT_X,
      kind: 'lot',
      label: 'Lote vacío',
      children: [],
    };

    render(
      <RecallTraceTree
        tree={onlyRoot}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('treeitem')).toHaveLength(1);
    expect(screen.getByText('Lote vacío')).toBeInTheDocument();
  });

  it('marks active chip via aria-checked=true on the forward radio when mode="forward"', () => {
    render(
      <RecallTraceTree
        tree={threeLevelTree}
        mode="forward"
        onModeChange={vi.fn()}
      />,
    );

    const forwardBtn = screen.getByRole('radio', { name: /Adelante/i });
    const reverseBtn = screen.getByRole('radio', { name: /Atrás/i });
    expect(forwardBtn.getAttribute('aria-checked')).toBe('true');
    expect(reverseBtn.getAttribute('aria-checked')).toBe('false');
  });
});
