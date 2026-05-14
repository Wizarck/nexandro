import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Lot } from '../../inventory/lot/domain/lot.entity';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import {
  ALL_INCIDENT_SEARCH_KINDS,
  INCIDENT_SEARCH_DEFAULT_LIMIT,
  INCIDENT_SEARCH_MAX_LIMIT,
  IncidentSearchHit,
  IncidentSearchKind,
  IncidentSearchOpts,
} from '../types';

/**
 * Per-anchor LIMIT before service-layer merge + rank. Each anchor source
 * returns at most this many candidates; the merged pool (≤ 4 × 8 = 32) is
 * then ranked and sliced down to `INCIDENT_SEARCH_MAX_LIMIT`.
 */
const PER_ANCHOR_LIMIT = 8 as const;

/**
 * Hard-coded Spanish symptom synonym table per ADR-RECALL-SYMPTOM-CORPUS
 * (design.md, slice #11). Each canonical symptom maps to a small set of
 * surface forms. Richer corpus (org-configurable, multi-locale) is M3.x.
 *
 * The table is keyed by the canonical lemma; the values are normalised
 * (lowercase, ascii-folded) forms the operator might type. Match logic:
 * tokenise the query, ascii-fold + lowercase, look up each token across
 * ALL value arrays — a hit on any value contributes to the score.
 */
const SYMPTOM_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  diarrea: ['diarrea', 'gastroenteritis', 'estomago suelto'],
  vomito: ['vomito', 'nausea'],
  fiebre: ['fiebre', 'temperatura'],
  intoxicacion: ['intoxicacion', 'envenenamiento'],
  alergia: ['alergia', 'reaccion alergica'],
  salmonella: ['salmonella', 'salmonelosis'],
};

/**
 * Flat lookup: every surface form → its canonical lemma. Built once at
 * module load.
 */
const SYMPTOM_LOOKUP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, forms] of Object.entries(SYMPTOM_SYNONYMS)) {
    for (const f of forms) m.set(f, canonical);
  }
  return m;
})();

/**
 * ASCII-fold + lowercase. Strips Spanish accents so `vómito` matches
 * `vomito`. Used by both the symptom matcher and the query tokeniser.
 */
function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Tokenise the query into the set of canonical symptom lemmas it
 * mentions. Returns an empty set when the query contains no recognised
 * symptom token (the common case — operator types a lot code or a
 * supplier name).
 */
function extractSymptomLemmas(query: string): Set<string> {
  const lemmas = new Set<string>();
  // Tokenise on whitespace + punctuation; cheap enough.
  const tokens = normalise(query).split(/[\s,.;:!?]+/).filter(Boolean);
  // Greedy bigram match first so "estomago suelto" maps to `diarrea`.
  for (let i = 0; i < tokens.length; i += 1) {
    const bigram = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : null;
    if (bigram && SYMPTOM_LOOKUP.has(bigram)) {
      lemmas.add(SYMPTOM_LOOKUP.get(bigram)!);
      continue;
    }
    if (SYMPTOM_LOOKUP.has(tokens[i])) {
      lemmas.add(SYMPTOM_LOOKUP.get(tokens[i])!);
    }
  }
  return lemmas;
}

/**
 * IncidentSearchService — multi-anchor (lot / supplier / ingredient /
 * aggregate) search surface for the J6 recall investigation screen.
 *
 * Per ADR-028 (recall BC location) + ADR-031 (index strategy):
 *  - Four anchor sources queried in parallel via `Promise.all`.
 *  - Each anchor source returns at most `PER_ANCHOR_LIMIT` candidates.
 *  - Service-layer merge + rank: `(receivedAt DESC NULLS LAST,
 *    symptomMatchScore DESC, label ASC)`.
 *  - Hard 8-result cap applied after rank (j6.md §3 — single-screen-no-
 *    scroll).
 *  - Empty input short-circuits to `[]` (no DB round-trip).
 *
 * Multi-tenant invariant: `organizationId` is the FIRST parameter on
 * every public method and is gated inline in every WHERE clause.
 */
@Injectable()
export class IncidentSearchService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(Lot)
    private readonly lotRepo: Repository<Lot>,
  ) {}

  async search(
    organizationId: string,
    query: string,
    opts?: IncidentSearchOpts,
  ): Promise<IncidentSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // ADR-RECALL-SEARCH-EMPTY-INPUT — zero DB round-trips.
      return [];
    }

    const requestedTypes: readonly IncidentSearchKind[] =
      opts?.types && opts.types.length > 0 ? opts.types : ALL_INCIDENT_SEARCH_KINDS;
    const typeSet = new Set<IncidentSearchKind>(requestedTypes);

    const requestedLimit = opts?.limit ?? INCIDENT_SEARCH_DEFAULT_LIMIT;
    const effectiveLimit = Math.min(
      Math.max(1, Math.trunc(requestedLimit)),
      INCIDENT_SEARCH_MAX_LIMIT,
    );

    const symptomLemmas = extractSymptomLemmas(trimmed);

    const tasks: Array<Promise<IncidentSearchHit[]>> = [];
    if (typeSet.has('lot')) {
      tasks.push(this.searchLots(organizationId, trimmed, symptomLemmas));
    }
    if (typeSet.has('supplier')) {
      tasks.push(this.searchSuppliers(organizationId, trimmed));
    }
    if (typeSet.has('ingredient')) {
      tasks.push(this.searchIngredients(organizationId, trimmed));
    }
    if (typeSet.has('aggregate')) {
      tasks.push(this.searchAuditLogAggregates(organizationId, trimmed, symptomLemmas));
    }

    const buckets = await Promise.all(tasks);
    const merged: IncidentSearchHit[] = [];
    for (const b of buckets) merged.push(...b);

    merged.sort(rankIncidentSearchHits);
    return merged.slice(0, effectiveLimit);
  }

  /**
   * Lots anchor — matches the operator's literal substring against the
   * lot's UUID prefix + `metadata->>'supplier_lot_code'`. Uses the
   * `idx_lots_org_supplier_received` index (slice #1 migration 0026) for
   * ordering by recency.
   */
  private async searchLots(
    organizationId: string,
    query: string,
    symptomLemmas: Set<string>,
  ): Promise<IncidentSearchHit[]> {
    const like = `%${query}%`;
    const rows = await this.lotRepo
      .createQueryBuilder('lot')
      .where('lot.organization_id = :organizationId', { organizationId })
      .andWhere(
        "(lot.id::text ILIKE :like OR lot.metadata->>'supplier_lot_code' ILIKE :like)",
        { like },
      )
      .orderBy('lot.received_at', 'DESC')
      .limit(PER_ANCHOR_LIMIT)
      .getMany();
    return rows.map((lot) => {
      const code =
        typeof lot.metadata?.['supplier_lot_code'] === 'string'
          ? (lot.metadata['supplier_lot_code'] as string)
          : lot.id.slice(0, 8);
      const symptomMatchScore = scoreFromMetadata(lot.metadata, symptomLemmas);
      return {
        kind: 'lot' as const,
        id: lot.id,
        label: code,
        supportingText: `Recibido ${lot.receivedAt.toISOString().slice(0, 10)}`,
        receivedAt: lot.receivedAt.toISOString(),
        symptomMatchScore,
      };
    });
  }

  /**
   * Suppliers anchor — trigram-GIN-backed `name ILIKE '%query%'`. Uses
   * `idx_suppliers_name_trgm` (this slice's migration 0035). Suppliers
   * have no `receivedAt`; they rank last via NULLS LAST.
   */
  private async searchSuppliers(
    organizationId: string,
    query: string,
  ): Promise<IncidentSearchHit[]> {
    const like = `%${query}%`;
    const rows = await this.supplierRepo
      .createQueryBuilder('supplier')
      .where('supplier.organization_id = :organizationId', { organizationId })
      .andWhere('supplier.name ILIKE :like', { like })
      .orderBy('supplier.name', 'ASC')
      .limit(PER_ANCHOR_LIMIT)
      .getMany();
    return rows.map((supplier) => ({
      kind: 'supplier' as const,
      id: supplier.id,
      label: supplier.name,
      supportingText: supplier.country,
      receivedAt: null,
      symptomMatchScore: 0,
    }));
  }

  /**
   * Ingredients anchor — trigram-GIN-backed `name ILIKE '%query%'`. Uses
   * `idx_ingredients_name_trgm` (this slice's migration 0035).
   */
  private async searchIngredients(
    organizationId: string,
    query: string,
  ): Promise<IncidentSearchHit[]> {
    const like = `%${query}%`;
    const rows = await this.ingredientRepo
      .createQueryBuilder('ingredient')
      .where('ingredient.organization_id = :organizationId', { organizationId })
      .andWhere('ingredient.name ILIKE :like', { like })
      .orderBy('ingredient.name', 'ASC')
      .limit(PER_ANCHOR_LIMIT)
      .getMany();
    return rows.map((ingredient) => ({
      kind: 'ingredient' as const,
      id: ingredient.id,
      label: ingredient.name,
      supportingText: ingredient.baseUnitType,
      receivedAt: null,
      symptomMatchScore: 0,
    }));
  }

  /**
   * Audit-log aggregate anchor — matches the operator's literal
   * substring against `payload_after->>'lot_code'`. Uses the partial
   * GIN `idx_audit_log_org_lot_code` (this slice's migration 0035).
   *
   * Returns one hit per (aggregateType, aggregateId) pair, keyed on the
   * MOST RECENT audit row for that pair.
   */
  private async searchAuditLogAggregates(
    organizationId: string,
    query: string,
    symptomLemmas: Set<string>,
  ): Promise<IncidentSearchHit[]> {
    const like = `%${query}%`;
    const rows = await this.auditLogRepo
      .createQueryBuilder('a')
      .where('a.organization_id = :organizationId', { organizationId })
      .andWhere("a.payload_after->>'lot_code' IS NOT NULL")
      .andWhere("a.payload_after->>'lot_code' ILIKE :like", { like })
      .orderBy('a.created_at', 'DESC')
      .limit(PER_ANCHOR_LIMIT)
      .getMany();
    return rows.map((row) => {
      const payload = (row.payloadAfter ?? {}) as Record<string, unknown>;
      const lotCode =
        typeof payload['lot_code'] === 'string' ? (payload['lot_code'] as string) : row.aggregateId.slice(0, 8);
      const symptomMatchScore = scoreFromMetadata(payload, symptomLemmas);
      return {
        kind: 'aggregate' as const,
        id: `${row.aggregateType}:${row.aggregateId}`,
        label: lotCode,
        supportingText: `${row.eventType} · ${row.createdAt.toISOString().slice(0, 10)}`,
        receivedAt: row.createdAt.toISOString(),
        symptomMatchScore,
      };
    });
  }
}

/**
 * Stable sort comparator per ADR-RECALL-SEARCH-RANKING — recency DESC
 * (NULLS LAST), then symptom-match DESC, then label ASC.
 */
function rankIncidentSearchHits(
  a: IncidentSearchHit,
  b: IncidentSearchHit,
): number {
  // receivedAt DESC NULLS LAST
  if (a.receivedAt && b.receivedAt) {
    if (a.receivedAt > b.receivedAt) return -1;
    if (a.receivedAt < b.receivedAt) return 1;
  } else if (a.receivedAt && !b.receivedAt) {
    return -1;
  } else if (!a.receivedAt && b.receivedAt) {
    return 1;
  }
  // symptomMatchScore DESC
  if (a.symptomMatchScore !== b.symptomMatchScore) {
    return b.symptomMatchScore - a.symptomMatchScore;
  }
  // label ASC (stable tiebreaker)
  if (a.label < b.label) return -1;
  if (a.label > b.label) return 1;
  return 0;
}

/**
 * Score a metadata bag (or payload_after envelope) against the
 * extracted symptom lemmas. Each present field key listed below
 * contributes one normalised string to the matching pool.
 *
 * Pure function; null-safe. Caps at 1.0.
 */
function scoreFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  symptomLemmas: Set<string>,
): number {
  if (!metadata || symptomLemmas.size === 0) return 0;
  const candidateFields = ['symptom', 'symptoms', 'reason', 'notes'];
  const haystackParts: string[] = [];
  for (const f of candidateFields) {
    const v = metadata[f];
    if (typeof v === 'string') haystackParts.push(v);
  }
  if (haystackParts.length === 0) return 0;
  const haystack = normalise(haystackParts.join(' '));
  let hits = 0;
  for (const lemma of symptomLemmas) {
    const forms = SYMPTOM_SYNONYMS[lemma] ?? [];
    for (const form of forms) {
      if (haystack.includes(form)) {
        hits += 1;
        break;
      }
    }
  }
  return Math.min(1, hits / symptomLemmas.size);
}
