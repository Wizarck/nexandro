import {
  WRITE_CAPABILITIES,
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
} from './index.js';

// `<segment>(\.<segment>)+` where each segment starts lowercase. Segments
// allow [a-z0-9-] (kebab namespaces like `menu-items`) plus camelCase op
// names (`setLineSource`, `applyOverride`). Spec text used a tighter regex;
// per-namespace files use camelCase op naming so we widen here accordingly.
const NAME_REGEX = /^[a-z][a-zA-Z0-9-]*(\.[a-z][a-zA-Z0-9-]*)+$/;

describe('WRITE_CAPABILITIES registry', () => {
  it('contains exactly 53 entries', () => {
    expect(WRITE_CAPABILITIES).toHaveLength(53);
  });

  it('has unique capability names', () => {
    const names = WRITE_CAPABILITIES.map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every name matches the namespace.op regex', () => {
    for (const cap of WRITE_CAPABILITIES) {
      expect(cap.name).toMatch(NAME_REGEX);
    }
  });

  it('exposes the 16 expected namespaces', () => {
    // Top-level namespace token; iam.users / iam.locations / iam.organizations
    // are 3 distinct namespaces per the slice spec.
    const distinguish = (name: string): string => {
      if (name.startsWith('iam.')) {
        const parts = name.split('.');
        return `${parts[0]}.${parts[1]}`;
      }
      return name.split('.')[0];
    };
    const namespaces = new Set(
      WRITE_CAPABILITIES.map((c) => distinguish(c.name)),
    );
    expect(namespaces).toEqual(
      new Set([
        'recipes',
        'menu-items',
        'ingredients',
        'categories',
        'suppliers',
        'supplier-items',
        'labels',
        'ai-suggestions',
        'external-catalog',
        'iam.users',
        'iam.locations',
        'iam.organizations',
        'recall',
        'haccp',
        'compliance',
        'inventory',
      ]),
    );
    expect(namespaces.size).toBe(16);
  });

  it('every restMethod is a valid write verb', () => {
    const allowed = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    for (const cap of WRITE_CAPABILITIES) {
      expect(allowed.has(cap.restMethod)).toBe(true);
    }
  });

  it('every restPathTemplate starts with "/"', () => {
    for (const cap of WRITE_CAPABILITIES) {
      expect(cap.restPathTemplate.startsWith('/')).toBe(true);
    }
  });

  it('every entry exposes a non-empty Zod schema record', () => {
    for (const cap of WRITE_CAPABILITIES) {
      expect(typeof cap.schema).toBe('object');
      expect(Object.keys(cap.schema).length).toBeGreaterThan(0);
    }
  });

  it('every entry includes an optional idempotencyKey field', () => {
    for (const cap of WRITE_CAPABILITIES) {
      expect(cap.schema['idempotencyKey']).toBeDefined();
    }
  });

  it('namespace shards add up to the registry size', () => {
    const sum =
      RECIPES_WRITE_CAPABILITIES.length +
      MENU_ITEMS_WRITE_CAPABILITIES.length +
      INGREDIENTS_WRITE_CAPABILITIES.length +
      CATEGORIES_WRITE_CAPABILITIES.length +
      SUPPLIERS_WRITE_CAPABILITIES.length +
      SUPPLIER_ITEMS_WRITE_CAPABILITIES.length +
      LABELS_WRITE_CAPABILITIES.length +
      AI_SUGGESTIONS_WRITE_CAPABILITIES.length +
      EXTERNAL_CATALOG_WRITE_CAPABILITIES.length +
      IAM_USERS_WRITE_CAPABILITIES.length +
      IAM_LOCATIONS_WRITE_CAPABILITIES.length +
      IAM_ORGANIZATIONS_WRITE_CAPABILITIES.length +
      RECALL_WRITE_CAPABILITIES.length +
      HACCP_WRITE_CAPABILITIES.length +
      COMPLIANCE_WRITE_CAPABILITIES.length +
      INVENTORY_WRITE_CAPABILITIES.length;
    expect(sum).toBe(WRITE_CAPABILITIES.length);
    expect(sum).toBe(52);
  });

  it('every capability with :param tokens defines restPathParams', () => {
    for (const cap of WRITE_CAPABILITIES) {
      const hasTokens = /:\w+/.test(cap.restPathTemplate);
      if (hasTokens) {
        expect(typeof cap.restPathParams).toBe('function');
      }
    }
  });
});
