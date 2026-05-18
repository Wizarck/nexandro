/**
 * Map enum-style audit_log event types (e.g. `RECIPE_ALLERGENS_OVERRIDE_CHANGED`)
 * to human-readable Spanish labels (e.g. "Receta · alérgenos sobrescritos").
 *
 * Per audit 2026-05-18 L1-7: the raw SCREAMING_SNAKE_CASE enums leak DB
 * schema into the operator UI and read like a developer console. EU
 * food-safety inspectors (primary persona for /audit-log) need readable
 * Spanish; chefs do too.
 *
 * Fallback for un-mapped events: lower-case + replace underscores with
 * spaces + capitalise first letter ("FOO_BAR_BAZ" → "Foo bar baz") so new
 * event types stay parseable even before they get a curated translation.
 *
 * Also exposes a category bucket so the filter UI can group related events
 * (Operaciones / Inventario / IA / Fotos / Recall / HACCP / Forense) per
 * the audit recommendation.
 */

export type EventCategory =
  | 'inventario'
  | 'recetas'
  | 'compras'
  | 'recall'
  | 'haccp'
  | 'fotos'
  | 'ia'
  | 'forense'
  | 'otro';

interface EventDescriptor {
  label: string;
  category: EventCategory;
}

const TABLE: Record<string, EventDescriptor> = {
  // Inventario / lotes
  LOT_CREATED: { label: 'Lote · creado', category: 'inventario' },
  LOT_CONSUMED: { label: 'Lote · consumido', category: 'inventario' },
  LOT_EXPIRY_NEAR: { label: 'Lote · caducidad próxima', category: 'inventario' },
  LOT_FLAGGED_FOR_REVIEW: { label: 'Lote · marcado para revisión', category: 'inventario' },
  LOT_REVIEW_CLEARED: { label: 'Lote · revisión cerrada', category: 'inventario' },
  COST_SNAPSHOT_RECORDED: { label: 'Coste · snapshot registrado', category: 'inventario' },

  // Recetas / ingredientes / etiquetas
  RECIPE_CREATED: { label: 'Receta · creada', category: 'recetas' },
  RECIPE_UPDATED: { label: 'Receta · modificada', category: 'recetas' },
  RECIPE_COST_REBUILT: { label: 'Receta · coste recalculado', category: 'recetas' },
  RECIPE_ALLERGENS_OVERRIDE_CHANGED: { label: 'Receta · alérgenos sobrescritos', category: 'recetas' },
  INGREDIENT_CREATED: { label: 'Ingrediente · creado', category: 'recetas' },
  INGREDIENT_UPDATED: { label: 'Ingrediente · modificado', category: 'recetas' },
  INGREDIENT_OVERRIDE_CHANGED: { label: 'Ingrediente · sobrescrito', category: 'recetas' },
  MENU_ITEM_CREATED: { label: 'Plato · creado', category: 'recetas' },
  MENU_ITEM_UPDATED: { label: 'Plato · modificado', category: 'recetas' },

  // Compras / proveedores
  PO_CREATED: { label: 'Pedido · creado', category: 'compras' },
  PO_SENT: { label: 'Pedido · enviado', category: 'compras' },
  PO_RECEIVED_PARTIAL: { label: 'Pedido · recibido parcial', category: 'compras' },
  PO_RECEIVED_FULL: { label: 'Pedido · recibido completo', category: 'compras' },
  GR_DRAFT_CREATED: { label: 'Recepción · borrador creado', category: 'compras' },
  GR_CONFIRMED: { label: 'Recepción · confirmada', category: 'compras' },
  GR_FLAGGED_FOR_REVIEW: { label: 'Recepción · marcada para revisión', category: 'compras' },
  GR_REVIEW_CLEARED: { label: 'Recepción · revisión cerrada', category: 'compras' },
  SUPPLIER_CREATED: { label: 'Proveedor · creado', category: 'compras' },
  SUPPLIER_UPDATED: { label: 'Proveedor · modificado', category: 'compras' },

  // Recall
  RECALL_INCIDENT_OPENED: { label: 'Retirada · incidente abierto', category: 'recall' },
  RECALL_INCIDENT_DISPATCHED: { label: 'Retirada · dossier despachado', category: 'recall' },
  RECALL_INCIDENT_REDISPATCHED: { label: 'Retirada · re-despachado', category: 'recall' },
  RECALL_INCIDENT_ADDENDUM: { label: 'Retirada · addendum añadido', category: 'recall' },

  // HACCP
  CCP_READING_RECORDED: { label: 'HACCP · lectura registrada', category: 'haccp' },
  CCP_CORRECTIVE_ACTION_RECORDED: { label: 'HACCP · acción correctiva', category: 'haccp' },
  FSMS_STANDARD_CONFIGURED: { label: 'HACCP · plan configurado', category: 'haccp' },

  // Fotos
  PHOTO_UPLOADED: { label: 'Foto · subida', category: 'fotos' },
  PHOTO_DELETED: { label: 'Foto · borrada', category: 'fotos' },
  PHOTO_INGESTION_AUTO_FILLED: { label: 'Foto · auto-rellenada', category: 'fotos' },
  PHOTO_INGESTION_AWAITING_REVIEW: { label: 'Foto · espera revisión', category: 'fotos' },
  PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE: { label: 'Foto · rechazada por confianza baja', category: 'fotos' },
  PHOTO_INGESTION_SIGNED: { label: 'Foto · firmada', category: 'fotos' },
  PHOTO_INGESTION_RECLASSIFIED: { label: 'Foto · reclasificada', category: 'fotos' },
  PHOTO_INGESTION_DOWNSTREAM_ROUTED: { label: 'Foto · ruta downstream', category: 'fotos' },
  PHOTO_INGESTION_ROUTING_SKIPPED: { label: 'Foto · ruta saltada', category: 'fotos' },
  PHOTO_EXTRACTION_FAILED: { label: 'Foto · extracción fallida', category: 'fotos' },
  HITL_RETROACTIVE_CORRECTION: { label: 'Foto · corrección retroactiva', category: 'fotos' },
  DOWNSTREAM_REVOCATION_DEFERRED: { label: 'Foto · revocación diferida', category: 'fotos' },

  // IA / Hermes
  AI_SUGGESTION_ACCEPTED: { label: 'IA · sugerencia aceptada', category: 'ia' },
  AI_SUGGESTION_REJECTED: { label: 'IA · sugerencia rechazada', category: 'ia' },
  AI_BUDGET_TIER_CROSSED: { label: 'IA · umbral de presupuesto', category: 'ia' },
  AGENT_ACTION_EXECUTED: { label: 'Agente · acción ejecutada', category: 'ia' },
  AGENT_ACTION_FORENSIC: { label: 'Agente · forense', category: 'ia' },
  AGENT_CREDENTIAL_REGISTERED: { label: 'Agente · credencial registrada', category: 'ia' },
  AGENT_CREDENTIAL_REVOKED: { label: 'Agente · credencial revocada', category: 'ia' },

  // Compliance export
  COMPLIANCE_BUNDLE_GENERATED: { label: 'Expediente · generado', category: 'forense' },
};

export function humanizeEventType(enumValue: string): string {
  const hit = TABLE[enumValue];
  if (hit) return hit.label;
  return fallbackHumanize(enumValue);
}

export function eventCategory(enumValue: string): EventCategory {
  return TABLE[enumValue]?.category ?? 'otro';
}

function fallbackHumanize(s: string): string {
  if (!s) return '';
  const lowered = s.toLowerCase().replace(/_/g, ' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}
