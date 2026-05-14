import 'reflect-metadata';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import { IncidentSearchService } from '../application/incident-search.service';
import { IncidentSearchHit } from '../types';
import { RecallSearchController } from './recall-search.controller';
import { RecallSearchQueryDto } from './dto/recall-search-query.dto';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('RecallSearchController', () => {
  let searchMock: jest.Mock;
  let controller: RecallSearchController;

  beforeEach(() => {
    searchMock = jest.fn();
    const svc: Pick<IncidentSearchService, 'search'> = { search: searchMock };
    controller = new RecallSearchController(svc as IncidentSearchService);
  });

  it('delegates to IncidentSearchService.search with parsed args', async () => {
    const hits: IncidentSearchHit[] = [];
    searchMock.mockResolvedValue(hits);

    const query: RecallSearchQueryDto = {
      organizationId: ORG,
      q: 'tomate',
      types: ['lot', 'supplier'],
      limit: 8,
    } as RecallSearchQueryDto;

    const result = await controller.search(query);

    expect(searchMock).toHaveBeenCalledWith(ORG, 'tomate', {
      types: ['lot', 'supplier'],
      limit: 8,
    });
    expect(result).toEqual({ hits });
  });

  it('forwards undefined types + limit when omitted', async () => {
    searchMock.mockResolvedValue([]);

    const query: RecallSearchQueryDto = {
      organizationId: ORG,
      q: 'alborada',
    } as RecallSearchQueryDto;

    await controller.search(query);

    expect(searchMock).toHaveBeenCalledTimes(1);
    const callArg = searchMock.mock.calls[0];
    expect(callArg[0]).toBe(ORG);
    expect(callArg[1]).toBe('alborada');
    // opts.types undefined → service defaults to all four anchors.
    expect(callArg[2].types).toBeUndefined();
  });

  it('search method carries @Roles("OWNER", "MANAGER") metadata', () => {
    // NestJS SetMetadata stores roles on descriptor.value (the function),
    // not on propertyKey. Past slices have burned on the wrong access path.
    const proto = RecallSearchController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const fn = proto.search;
    expect(typeof fn).toBe('function');
    const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
      | string[]
      | undefined;
    expect(roles).toBeDefined();
    expect(roles).toEqual(['OWNER', 'MANAGER']);
  });
});
