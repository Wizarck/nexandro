/**
 * Barrel for the WRITE_CAPABILITIES registry.
 *
 * Per ADR-MCP-W-REGISTRY (m2-mcp-write-capabilities/design.md): 43 write
 * capabilities across 12 namespaces. `buildServer()` (in `src/index.ts`)
 * loops this array and registers each tool with the MCP SDK.
 *
 * Adding a 44th capability post-merge is one new entry in the relevant
 * namespace file plus reading the spread here.
 */

export * from './types.js';
export * from './render-path.js';

import { RECIPES_WRITE_CAPABILITIES } from './recipes.js';
import { MENU_ITEMS_WRITE_CAPABILITIES } from './menu-items.js';
import { INGREDIENTS_WRITE_CAPABILITIES } from './ingredients.js';
import { CATEGORIES_WRITE_CAPABILITIES } from './categories.js';
import { SUPPLIERS_WRITE_CAPABILITIES } from './suppliers.js';
import { SUPPLIER_ITEMS_WRITE_CAPABILITIES } from './supplier-items.js';
import { LABELS_WRITE_CAPABILITIES } from './labels.js';
import { AI_SUGGESTIONS_WRITE_CAPABILITIES } from './ai-suggestions.js';
import { EXTERNAL_CATALOG_WRITE_CAPABILITIES } from './external-catalog.js';
import { IAM_USERS_WRITE_CAPABILITIES } from './iam-users.js';
import { IAM_LOCATIONS_WRITE_CAPABILITIES } from './iam-locations.js';
import { IAM_ORGANIZATIONS_WRITE_CAPABILITIES } from './iam-organizations.js';
import { RECALL_WRITE_CAPABILITIES } from './recall.js';
import { HACCP_WRITE_CAPABILITIES } from './haccp.js';
import { COMPLIANCE_WRITE_CAPABILITIES } from './compliance.js';
import { INVENTORY_WRITE_CAPABILITIES } from './inventory.js';

import type { WriteCapability } from './types.js';

export {
  RECIPES_WRITE_CAPABILITIES,
  MENU_ITEMS_WRITE_CAPABILITIES,
  INGREDIENTS_WRITE_CAPABILITIES,
  CATEGORIES_WRITE_CAPABILITIES,
  SUPPLIERS_WRITE_CAPABILITIES,
  SUPPLIER_ITEMS_WRITE_CAPABILITIES,
  LABELS_WRITE_CAPABILITIES,
  AI_SUGGESTIONS_WRITE_CAPABILITIES,
  EXTERNAL_CATALOG_WRITE_CAPABILITIES,
  IAM_USERS_WRITE_CAPABILITIES,
  IAM_LOCATIONS_WRITE_CAPABILITIES,
  IAM_ORGANIZATIONS_WRITE_CAPABILITIES,
  RECALL_WRITE_CAPABILITIES,
  HACCP_WRITE_CAPABILITIES,
  COMPLIANCE_WRITE_CAPABILITIES,
  INVENTORY_WRITE_CAPABILITIES,
};

export const WRITE_CAPABILITIES: ReadonlyArray<WriteCapability> = [
  ...RECIPES_WRITE_CAPABILITIES,
  ...MENU_ITEMS_WRITE_CAPABILITIES,
  ...INGREDIENTS_WRITE_CAPABILITIES,
  ...CATEGORIES_WRITE_CAPABILITIES,
  ...SUPPLIERS_WRITE_CAPABILITIES,
  ...SUPPLIER_ITEMS_WRITE_CAPABILITIES,
  ...LABELS_WRITE_CAPABILITIES,
  ...AI_SUGGESTIONS_WRITE_CAPABILITIES,
  ...EXTERNAL_CATALOG_WRITE_CAPABILITIES,
  ...IAM_USERS_WRITE_CAPABILITIES,
  ...IAM_LOCATIONS_WRITE_CAPABILITIES,
  ...IAM_ORGANIZATIONS_WRITE_CAPABILITIES,
  ...RECALL_WRITE_CAPABILITIES,
  ...HACCP_WRITE_CAPABILITIES,
  ...COMPLIANCE_WRITE_CAPABILITIES,
  ...INVENTORY_WRITE_CAPABILITIES,
];

/**
 * Capability names that are not yet usable via MCP transport (e.g.
 * `ingredients.import` requires multipart/form-data which the MCP SDK does
 * not natively carry). The handler in `index.ts` short-circuits these with a
 * clear "use REST directly" error before reaching the HTTP client.
 */
export const UNSUPPORTED_VIA_MCP: ReadonlySet<string> = new Set([
  'ingredients.import',
]);
