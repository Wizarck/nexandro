/**
 * Inline types for the procurement.po BC.
 *
 * Per Wave 2.1 lessons codified in [[feedback_subagent_apply_typing_fix_cascade]],
 * apps/api MUST NOT import from `@nexandro/contracts` (TS6059 risk under
 * rootDir=./src). This file mirrors the shapes that `packages/contracts/src/m3/po.ts`
 * publishes for cross-package callers; the contracts package owns the Zod
 * validators. Keep these in lockstep.
 *
 * Six PO states encoded as a frozen tuple:
 *  - `draft` — mutable, not yet sent to supplier
 *  - `sent` — sent to supplier, awaiting first delivery
 *  - `partially_received` — at least one but not all lines fully received
 *  - `received` — all lines fully received
 *  - `closed` — terminal: manually closed (paid, archived)
 *  - `cancelled` — terminal: cancelled before completion
 */

export const PO_STATES = [
  'draft',
  'sent',
  'partially_received',
  'received',
  'closed',
  'cancelled',
] as const;

export type PoState = (typeof PO_STATES)[number];

export const MONEY_UNITS = ['kg', 'g', 'L', 'ml', 'un'] as const;

export type MoneyUnit = (typeof MONEY_UNITS)[number];

/**
 * ISO 4217 alpha-3 currency code. We do not narrow to the universe of
 * recognised codes here — operators may legitimately use codes not in any
 * fixed enum (e.g. obscure jurisdictions). DB CHECK enforces length=3.
 */
export type CurrencyCode = string;

export interface CreatePoLineInput {
  ingredientId: string;
  quantityOrdered: number;
  unit: MoneyUnit;
  unitPrice: number;
  vatRate: number;
  vatInclusive: boolean;
}

export interface CreatePoInput {
  organizationId: string;
  supplierId: string;
  createdByUserId: string;
  currency: CurrencyCode;
  expectedDeliveryDate?: Date | null;
  notes?: string | null;
  lines: CreatePoLineInput[];
}

/**
 * Internal computed-line shape used by `PoFactory` to project raw input
 * into the persistence shape (with VAT math applied).
 */
export interface ComputedPoLine {
  lineNumber: number;
  ingredientId: string;
  quantityOrdered: number;
  unit: MoneyUnit;
  unitPrice: number;
  vatRate: number;
  vatInclusive: boolean;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
}
