/**
 * Recall trace domain errors.
 *
 * Translated to HTTP at the controller layer:
 *   - RecallAnchorNotFoundError       → 404 NotFoundException
 *   - RecallInvalidAnchorKindError    → 422 UnprocessableEntityException
 */

export class RecallAnchorNotFoundError extends Error {
  readonly code = 'RECALL_ANCHOR_NOT_FOUND';
  constructor(
    public readonly anchorId: string,
    public readonly anchorKind: string,
  ) {
    super(
      `Recall anchor not found: kind="${anchorKind}" id="${anchorId}" ` +
        `(no row in the owning organisation)`,
    );
    this.name = 'RecallAnchorNotFoundError';
  }
}

export class RecallInvalidAnchorKindError extends Error {
  readonly code = 'RECALL_INVALID_ANCHOR_KIND';
  constructor(
    public readonly anchorKind: string,
    public readonly reason: string,
  ) {
    super(
      `Recall anchor kind "${anchorKind}" cannot be resolved: ${reason}`,
    );
    this.name = 'RecallInvalidAnchorKindError';
  }
}
