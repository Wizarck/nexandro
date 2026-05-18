import {
  ReconciliationController,
  type ReconciliationListQueryDto,
} from './reconciliation.controller';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeQuery(
  overrides: Partial<ReconciliationListQueryDto> = {},
): ReconciliationListQueryDto {
  return { organizationId: ORG, ...overrides } as ReconciliationListQueryDto;
}

describe('ReconciliationController (Sprint 3 Block C — j11 shell)', () => {
  let controller: ReconciliationController;

  beforeEach(() => {
    controller = new ReconciliationController();
  });

  it('returns empty placeholder list (domain pending)', async () => {
    const result = await controller.list(makeQuery());
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('returns empty list for any organizationId (placeholder is org-agnostic)', async () => {
    const result = await controller.list(
      makeQuery({ organizationId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('shape is { items: [], total: number } — frontend depends on this contract', async () => {
    const result = await controller.list(makeQuery());
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
  });
});
