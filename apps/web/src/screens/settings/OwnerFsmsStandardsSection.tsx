import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck, Thermometer } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import { useFsmsStandardsQuery } from '../../hooks/useFsmsStandards';
import type {
  CcpDefinition,
  CcpInputType,
  FsmsStandardResponse,
} from '../../api/fsmsStandards';

const INPUT_TYPE_LABELS: Record<CcpInputType, string> = {
  numeric: 'Numérico',
  checkbox: 'Sí / No',
  'multi-select': 'Selección múltiple',
  range: 'Rango',
};

/**
 * Normativa HACCP · Sprint 4 W1-B — backs `/m3/haccp/fsms-standards`.
 *
 * El backend (`fsms-standard.controller.ts`) es append-only por design.md
 * Decision A: cada "republicación" crea una fila nueva con versión nueva;
 * el histórico queda inmutable. Esta tab muestra el catálogo de estándares
 * (uno o varios por nombre, con su ventana de vigencia) y permite expandir
 * cada uno para ver sus CCP (puntos críticos de control).
 *
 * Autoría inline (crear / republicar estándar desde Settings) NO entra en
 * esta slice — el flujo de definición de CCPs es complejo y vive en el
 * wizard j10 / picker de lectura. Followup en el PR body.
 */
export function OwnerFsmsStandardsSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para revisar tu normativa HACCP.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = useFsmsStandardsQuery(orgId);

  return (
    <section className="space-y-6" aria-label="Normativa HACCP">
      <header>
        <h2 className="font-display text-2xl text-ink">Normativa HACCP</h2>
        <p className="mt-1 text-sm text-mute">
          Los estándares FSMS (Food Safety Management System) y sus puntos críticos de control
          (CCP) que rigen tus registros HACCP. Cada estándar es inmutable una vez publicado:
          al modificarlo se crea una versión nueva y la anterior queda archivada con su ventana
          de vigencia.
        </p>
      </header>

      {query.isLoading && (
        <p className="text-sm text-mute">Cargando normativa…</p>
      )}
      {query.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo cargar la normativa: {query.error.message}
        </p>
      )}
      {query.data && <StandardsList rows={query.data} />}
    </section>
  );
}

function StandardsList({ rows }: { rows: FsmsStandardResponse[] }) {
  const grouped = useMemo(() => groupByName(rows), [rows]);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay normativa HACCP publicada. La publicación de un estándar FSMS se hace desde
        el wizard de configuración (próximamente desde esta misma pantalla).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ name, versions }) => (
        <StandardCard key={name} name={name} versions={versions} />
      ))}
    </div>
  );
}

function StandardCard({
  name,
  versions,
}: {
  name: string;
  versions: FsmsStandardResponse[];
}) {
  // Versions are pre-sorted DESC by effectiveFrom by the backend; the first
  // active one (effectiveUntil null or > now()) is the current.
  const now = Date.now();
  const active = versions.find((v) => {
    const from = Date.parse(v.effectiveFrom);
    const until = v.effectiveUntil ? Date.parse(v.effectiveUntil) : null;
    return from <= now && (until === null || until > now);
  });

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <ShieldCheck aria-hidden="true" size={14} className="mr-1 inline" />
            {name}
          </h3>
          <p className="mt-1 text-xs text-mute">
            {versions.length} {versions.length === 1 ? 'versión publicada' : 'versiones publicadas'}
            {active && <> · vigente: <strong>v{active.version}</strong></>}
          </p>
        </div>
      </header>
      <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
        {versions.map((v) => (
          <StandardRow key={v.id} row={v} isActive={v.id === active?.id} />
        ))}
      </ul>
    </article>
  );
}

function StandardRow({
  row,
  isActive,
}: {
  row: FsmsStandardResponse;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const from = formatDate(row.effectiveFrom);
  const until = row.effectiveUntil ? formatDate(row.effectiveUntil) : '—';
  const ccpCount = row.ccpDefinitions.length;
  const labelId = `fsms-${row.id}`;

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`${labelId}-details`}
        className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">
            <span className="font-mono">v{row.version}</span>
            {isActive && (
              <span className="ml-2 rounded-sm bg-(--color-accent-soft) px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                vigente
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-mute">
            Vigente desde {from} · hasta {until} · {ccpCount}{' '}
            {ccpCount === 1 ? 'CCP' : 'CCPs'}
          </p>
        </div>
        {expanded ? (
          <ChevronDown aria-hidden="true" size={14} className="text-mute" />
        ) : (
          <ChevronRight aria-hidden="true" size={14} className="text-mute" />
        )}
      </button>
      {expanded && (
        <div id={`${labelId}-details`} className="mt-3">
          <CcpTable ccps={row.ccpDefinitions} />
        </div>
      )}
    </li>
  );
}

function CcpTable({ ccps }: { ccps: CcpDefinition[] }) {
  if (ccps.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-subtle p-4 text-xs text-mute">
        Esta versión no declara CCPs.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle text-left uppercase tracking-wide text-mute">
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Etiqueta</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Unidad</th>
            <th className="px-3 py-2 font-medium">Rango</th>
          </tr>
        </thead>
        <tbody>
          {ccps.map((c) => (
            <tr key={c.id} className="border-b border-border-subtle last:border-0">
              <td className="px-3 py-2 font-mono text-ink">
                <Thermometer aria-hidden="true" size={10} className="mr-1 inline" />
                {c.id}
              </td>
              <td className="px-3 py-2 text-ink">{c.label}</td>
              <td className="px-3 py-2 text-mute">{INPUT_TYPE_LABELS[c.inputType]}</td>
              <td className="px-3 py-2 font-mono text-mute">{c.unit ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-mute">{formatRange(c.specMin, c.specMax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatRange(min?: number, max?: number): string {
  if (min === undefined && max === undefined) return '—';
  if (min !== undefined && max !== undefined) return `${min} – ${max}`;
  if (min !== undefined) return `≥ ${min}`;
  return `≤ ${max}`;
}

function groupByName(
  rows: FsmsStandardResponse[],
): Array<{ name: string; versions: FsmsStandardResponse[] }> {
  const map = new Map<string, FsmsStandardResponse[]>();
  for (const r of rows) {
    const arr = map.get(r.name) ?? [];
    arr.push(r);
    map.set(r.name, arr);
  }
  return [...map.entries()].map(([name, versions]) => ({ name, versions }));
}
