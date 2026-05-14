/**
 * Local mirror of `apps/api/src/recall/types.ts` per ADR-RECALL-CONTRACT-
 * INLINE (slice #11 m3-incident-search-multi-anchor). NO import from
 * `packages/contracts` — the cross-app contract is duplicated in the
 * two surfaces and kept in sync by reviewer eyeballs.
 */

export type IncidentSearchKind =
  | 'lot'
  | 'supplier'
  | 'ingredient'
  | 'aggregate';

export interface IncidentSearchHit {
  kind: IncidentSearchKind;
  id: string;
  label: string;
  supportingText: string;
  /** ISO 8601 timestamp; `null` for non-temporal hits (suppliers, ingredients). */
  receivedAt: string | null;
  /** Float in [0, 1]; `0` when no symptom token matched. */
  symptomMatchScore: number;
}

export interface IncidentSearchFieldProps {
  hits: IncidentSearchHit[];
  onSearch: (query: string) => void;
  onSelect: (hit: IncidentSearchHit) => void;
  loading?: boolean;
  placeholder?: string;
  emptyStateCopy?: string;
  value?: string;
  className?: string;
  'aria-label'?: string;
}
