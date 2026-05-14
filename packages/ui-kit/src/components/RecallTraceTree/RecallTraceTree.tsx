import { cn } from '../../lib/cn';
import type {
  RecallTraceTreeProps,
  TraceMode,
  TraceNode,
  TraceNodeKind,
} from './types';

/**
 * Recall consumption-tree renderer (M3 Wave 2.5 slice #12).
 *
 * Visual structure per DESIGN.md §6 + the j6 mock walkthrough: a single
 * FLAT list (NOT nested cards) with a left-margin accent rule rendered
 * per depth level. Each item carries `aria-level` matching its depth
 * (1-indexed for ARIA tree semantics). Touch targets ≥ 48 px tall.
 *
 * The mode chip below the tree toggles forward ↔ reverse; the consumer
 * owns the mode state and re-fetches via the appropriate hook.
 *
 * `depthExceeded` leaves render a muted `…profundidad excedida` eyebrow
 * to signal that traversal stopped at the per-org cap (NOT that the
 * data ran out).
 */
export function RecallTraceTree({
  tree,
  mode,
  onModeChange,
  loading = false,
  'aria-label': ariaLabel,
  className,
}: RecallTraceTreeProps) {
  if (loading && tree == null) {
    return <SkeletonTree className={className} />;
  }

  if (tree == null) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-(--color-border) p-8 text-center text-(--color-mute)',
          className,
        )}
        style={{ color: 'var(--color-mute)' }}
      >
        Selecciona un lote o un anclaje para iniciar la trazabilidad.
      </div>
    );
  }

  const flat = flattenTree(tree, 0);

  return (
    <div className={cn('space-y-3', className)}>
      <ul
        role="tree"
        aria-label={ariaLabel ?? 'Árbol de trazabilidad del lote'}
        className="m-0 list-none p-0"
      >
        {flat.map((entry) => (
          <TreeItem key={`${entry.node.id}:${entry.depth}`} {...entry} />
        ))}
      </ul>
      <ModeChip mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

interface FlatEntry {
  node: TraceNode;
  depth: number;
}

function flattenTree(node: TraceNode, depth: number): FlatEntry[] {
  const out: FlatEntry[] = [{ node, depth }];
  for (const child of node.children) {
    out.push(...flattenTree(child, depth + 1));
  }
  return out;
}

function TreeItem({ node, depth }: FlatEntry) {
  // Left-margin accent rule: indent + a 2 px coloured ruler at the
  // depth boundary. NOT a nested card.
  const indentPx = depth * 24;
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={node.children.length > 0 ? true : undefined}
      className="relative min-h-[48px] py-2 pr-3 text-sm text-(--color-ink)"
      style={{
        paddingLeft: `${indentPx + 16}px`,
        color: 'var(--color-ink)',
        borderLeft: depth > 0 ? '2px solid var(--color-border)' : 'none',
        marginLeft: depth > 0 ? `${(depth - 1) * 24 + 8}px` : '0px',
      }}
    >
      <div className="flex items-baseline gap-2">
        <KindBadge kind={node.kind} />
        <span className="font-medium" title={node.label}>
          {node.label}
        </span>
        {node.quantityBadge && (
          <span
            className="ml-1 rounded-full bg-(--color-surface) px-2 py-0.5 text-xs text-(--color-mute)"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-mute)',
            }}
          >
            {node.quantityBadge}
          </span>
        )}
      </div>
      {node.depthExceeded && (
        <div
          className="mt-1 text-xs uppercase tracking-[0.04em] text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          …profundidad excedida
        </div>
      )}
    </li>
  );
}

const KIND_LABELS: Record<TraceNodeKind, string> = {
  lot: 'Lote',
  recipe: 'Receta',
  'menu-item': 'Plato',
  'service-window': 'Servicio',
};

function KindBadge({ kind }: { kind: TraceNodeKind }) {
  return (
    <span
      className="rounded-full bg-(--color-surface) px-2 py-0.5 text-[10px] uppercase tracking-wide text-(--color-mute)"
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-mute)',
      }}
    >
      {KIND_LABELS[kind]}
    </span>
  );
}

function ModeChip({
  mode,
  onModeChange,
}: {
  mode: TraceMode;
  onModeChange: (next: TraceMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Dirección de la trazabilidad"
      className="flex items-center gap-2 pt-2"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'forward'}
        onClick={() => onModeChange('forward')}
        className={cn(
          'min-h-[48px] rounded-full border px-4 py-2 text-sm',
          mode === 'forward'
            ? 'border-(--color-ink) bg-(--color-ink) text-(--color-surface)'
            : 'border-(--color-border) bg-(--color-surface) text-(--color-mute)',
        )}
      >
        Adelante (qué se sirvió)
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'reverse'}
        onClick={() => onModeChange('reverse')}
        className={cn(
          'min-h-[48px] rounded-full border px-4 py-2 text-sm',
          mode === 'reverse'
            ? 'border-(--color-ink) bg-(--color-ink) text-(--color-surface)'
            : 'border-(--color-border) bg-(--color-surface) text-(--color-mute)',
        )}
      >
        Atrás (qué lo originó)
      </button>
    </div>
  );
}

function SkeletonTree({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2 rounded-lg border border-(--color-border) p-3', className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded bg-(--color-surface)"
          style={{ backgroundColor: 'var(--color-surface)' }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Cargando árbol de trazabilidad…</span>
    </div>
  );
}
