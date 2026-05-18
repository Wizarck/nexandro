import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogTable } from './AuditLogTable';
import type { AuditLogRow } from './AuditLogTable.types';

const baseRow: AuditLogRow = {
  id: 'row-1',
  eventType: 'AGENT_ACTION_FORENSIC',
  aggregateType: 'recipe',
  aggregateId: '00000000-0000-4000-8000-000000000001',
  actorUserId: 'user-1',
  actorKind: 'agent',
  agentName: 'claude-desktop',
  payloadBefore: { name: 'old' },
  payloadAfter: { name: 'new' },
  reason: 'recipes.update',
  citationUrl: null,
  snippet: null,
  createdAt: '2026-05-08T12:34:56.000Z',
};

describe('AuditLogTable', () => {
  it('renders the empty-state message when rows is empty and not loading', () => {
    render(<AuditLogTable rows={[]} expandedRowId={null} onToggleExpand={vi.fn()} />);
    expect(screen.getByText(/No hay eventos para los filtros aplicados/)).toBeInTheDocument();
  });

  it('renders skeleton placeholders when loading and rows is empty', () => {
    render(
      <AuditLogTable rows={[]} expandedRowId={null} onToggleExpand={vi.fn()} loading />,
    );
    expect(screen.getByText('Cargando eventos…', { exact: false })).toBeInTheDocument();
  });

  it('renders rows with the expected columns', () => {
    render(
      <AuditLogTable rows={[baseRow]} expandedRowId={null} onToggleExpand={vi.fn()} />,
    );
    // Per L1-7: event type rendered as human-readable Spanish label
    // (raw enum preserved in <td title>).
    expect(screen.getByText('Agente · forense')).toBeInTheDocument();
    expect(screen.getByText('recipe:00000000…')).toBeInTheDocument();
    expect(screen.getByText('claude-desktop', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('recipes.update')).toBeInTheDocument();
    expect(screen.getByText('2026-05-08 12:34:56')).toBeInTheDocument();
  });

  it('calls onToggleExpand with the row id when a row is clicked', () => {
    const toggle = vi.fn();
    render(
      <AuditLogTable rows={[baseRow]} expandedRowId={null} onToggleExpand={toggle} />,
    );
    fireEvent.click(screen.getByText('Agente · forense'));
    expect(toggle).toHaveBeenCalledWith('row-1');
  });

  it('renders <AuditLogRowDetail> inline when the row is expanded', () => {
    render(
      <AuditLogTable rows={[baseRow]} expandedRowId="row-1" onToggleExpand={vi.fn()} />,
    );
    expect(screen.getByText('payload_before')).toBeInTheDocument();
    expect(screen.getByText('payload_after')).toBeInTheDocument();
  });
});
