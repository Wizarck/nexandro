export interface BoundingBox {
  /** Field name the box corresponds to. Reciprocal hover link uses this. */
  fieldName: string;
  /** Top-left x in image pixels. */
  x: number;
  /** Top-left y in image pixels. */
  y: number;
  /** Width in image pixels. */
  w: number;
  /** Height in image pixels. */
  h: number;
  /** Human label for the screen-reader region (e.g. `Línea 1 — producto`). */
  label: string;
}

export interface PhotoViewerProps {
  photoUrl: string | null;
  boundingBoxes: ReadonlyArray<BoundingBox>;
  /**
   * Field name whose box should render highlighted. Lifted state per
   * ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE.
   */
  highlightedField?: string | null;
  /**
   * Fires when the operator hovers a bounding box. `null` when the
   * pointer leaves any box.
   */
  onBoxHover?: (fieldName: string | null) => void;
  /** Fires when the operator clicks the re-upload fallback link. */
  onReupload?: () => void;
  /** Fires when the operator clicks the `↓` toolbar button. */
  onDownload?: () => void;
  className?: string;
}
