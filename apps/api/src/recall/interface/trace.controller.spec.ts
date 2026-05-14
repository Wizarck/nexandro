import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  RecallAnchorNotFoundError,
  RecallInvalidAnchorKindError,
} from '../application/trace.errors';
import type { TraceNode } from '../types';
import { TraceController } from './trace.controller';
import type {
  TraceForwardQueryDto,
  TraceReverseQueryDto,
} from './dto/trace.dto';

const ORG = '11111111-1111-4111-8111-111111111111';
const LOT_X = '22222222-2222-4222-8222-222222222222';
const MENU_M = '44444444-4444-4444-8444-444444444444';

function tree(id: string): TraceNode {
  return { id, kind: 'lot', label: 'Lote', children: [] };
}

describe('TraceController.forward', () => {
  it('returns the service result on the happy path', async () => {
    const traceForward = jest.fn().mockResolvedValue(tree(LOT_X));
    const traceReverse = jest.fn();
    const controller = new TraceController({
      traceForward,
      traceReverse,
    } as never);

    const out = await controller.forward({
      organizationId: ORG,
      lotId: LOT_X,
    } as TraceForwardQueryDto);

    expect(out.id).toBe(LOT_X);
    expect(traceForward).toHaveBeenCalledWith(ORG, LOT_X);
  });

  it('translates RecallAnchorNotFoundError to NotFoundException', async () => {
    const traceForward = jest
      .fn()
      .mockRejectedValue(new RecallAnchorNotFoundError(LOT_X, 'lot'));
    const controller = new TraceController({
      traceForward,
      traceReverse: jest.fn(),
    } as never);

    await expect(
      controller.forward({
        organizationId: ORG,
        lotId: LOT_X,
      } as TraceForwardQueryDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TraceController.reverse', () => {
  it('returns the service result on the happy path', async () => {
    const traceReverse = jest
      .fn()
      .mockResolvedValue({ ...tree(MENU_M), kind: 'menu-item' });
    const controller = new TraceController({
      traceForward: jest.fn(),
      traceReverse,
    } as never);

    const out = await controller.reverse({
      organizationId: ORG,
      anchorId: MENU_M,
      anchorKind: 'menu-item',
    } as TraceReverseQueryDto);

    expect(out.id).toBe(MENU_M);
    expect(traceReverse).toHaveBeenCalledWith(ORG, {
      id: MENU_M,
      kind: 'menu-item',
    });
  });

  it('translates RecallInvalidAnchorKindError to UnprocessableEntityException', async () => {
    const traceReverse = jest
      .fn()
      .mockRejectedValue(
        new RecallInvalidAnchorKindError(
          'symptom',
          'symptom-anchor resolver not yet wired',
        ),
      );
    const controller = new TraceController({
      traceForward: jest.fn(),
      traceReverse,
    } as never);

    await expect(
      controller.reverse({
        organizationId: ORG,
        anchorId: MENU_M,
        anchorKind: 'symptom',
      } as TraceReverseQueryDto),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('translates RecallAnchorNotFoundError to NotFoundException', async () => {
    const traceReverse = jest
      .fn()
      .mockRejectedValue(new RecallAnchorNotFoundError(MENU_M, 'menu-item'));
    const controller = new TraceController({
      traceForward: jest.fn(),
      traceReverse,
    } as never);

    await expect(
      controller.reverse({
        organizationId: ORG,
        anchorId: MENU_M,
        anchorKind: 'menu-item',
      } as TraceReverseQueryDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
