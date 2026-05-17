import type { Locale } from './locales';

/**
 * EU 1169/2011 Annex II — the 14 declarable allergens. The code is the
 * canonical machine identifier (matching `packages/ui-kit/AllergenBadge`'s
 * exported `AllergenCode` type); the localised display name is the
 * regulator-defined vocabulary for the four autonomous-community
 * languages nexandro targets (FR24 — "verbatim, not paraphrased").
 *
 * 14 codes × 4 locales = 56 entries. The table is hard-coded (not
 * database-backed) per ADR-J9-ALLERGEN-VOCABULARY-INLINE-TABLE:
 *  - the Annex II catalogue is stable since 2011; updates are rare
 *    enough to flow through code review,
 *  - PDF rendering iterates per allergen per recipe per chapter — a
 *    database lookup per cell would be wasteful,
 *  - keeping the vocabulary in code review makes regulatory accuracy a
 *    code-level concern (FR24 is locked).
 */
export type AllergenCode =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soybeans'
  | 'milk'
  | 'tree-nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

const VOCABULARY: Readonly<Record<AllergenCode, Readonly<Record<Locale, string>>>> = Object.freeze({
  gluten: {
    'es-ES': 'Gluten',
    'ca-ES': 'Gluten',
    'eu-ES': 'Glutena',
    'gl-ES': 'Glute',
  },
  crustaceans: {
    'es-ES': 'Crustáceos',
    'ca-ES': 'Crustacis',
    'eu-ES': 'Krustazeoak',
    'gl-ES': 'Crustáceos',
  },
  eggs: {
    'es-ES': 'Huevos',
    'ca-ES': 'Ous',
    'eu-ES': 'Arrautzak',
    'gl-ES': 'Ovos',
  },
  fish: {
    'es-ES': 'Pescado',
    'ca-ES': 'Peix',
    'eu-ES': 'Arraina',
    'gl-ES': 'Peixe',
  },
  peanuts: {
    'es-ES': 'Cacahuetes',
    'ca-ES': 'Cacauets',
    'eu-ES': 'Kakahueteak',
    'gl-ES': 'Cacahuetes',
  },
  soybeans: {
    'es-ES': 'Soja',
    'ca-ES': 'Soja',
    'eu-ES': 'Soja',
    'gl-ES': 'Soia',
  },
  milk: {
    'es-ES': 'Leche',
    'ca-ES': 'Llet',
    'eu-ES': 'Esnea',
    'gl-ES': 'Leite',
  },
  'tree-nuts': {
    'es-ES': 'Frutos de cáscara',
    'ca-ES': 'Fruits de closca',
    'eu-ES': 'Fruitu lehorrak',
    'gl-ES': 'Froitos de casca',
  },
  celery: {
    'es-ES': 'Apio',
    'ca-ES': 'Api',
    'eu-ES': 'Apioa',
    'gl-ES': 'Apio',
  },
  mustard: {
    'es-ES': 'Mostaza',
    'ca-ES': 'Mostassa',
    'eu-ES': 'Ziape',
    'gl-ES': 'Mostaza',
  },
  sesame: {
    'es-ES': 'Granos de sésamo',
    'ca-ES': 'Grans de sèsam',
    'eu-ES': 'Sesamo aleak',
    'gl-ES': 'Grans de sésamo',
  },
  sulphites: {
    'es-ES': 'Sulfitos',
    'ca-ES': 'Sulfits',
    'eu-ES': 'Sulfitoak',
    'gl-ES': 'Sulfitos',
  },
  lupin: {
    'es-ES': 'Altramuces',
    'ca-ES': 'Tramussos',
    'eu-ES': 'Eskuzuriak',
    'gl-ES': 'Chochos',
  },
  molluscs: {
    'es-ES': 'Moluscos',
    'ca-ES': 'Mol·luscs',
    'eu-ES': 'Moluskuak',
    'gl-ES': 'Moluscos',
  },
});

export function isAllergenCode(value: unknown): value is AllergenCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VOCABULARY, value);
}

/**
 * Returns the EU 1169 Annex II vocabulary for `code` in `locale`. For
 * an unknown code, returns the code wrapped in guillemets (a sentinel
 * that surfaces visibly in the bundle so the regulator sees the gap
 * without the generator crashing).
 */
export function getAllergenName(code: string, locale: Locale): string {
  if (!isAllergenCode(code)) {
    return `«${code}»`;
  }
  return VOCABULARY[code][locale];
}
