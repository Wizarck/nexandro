// ============================================================
// @opentrattos/contracts — Cross-package Zod schemas + types
//
// This package hosts Zod-validated contracts shared between API,
// frontend, MCP server, and downstream slices. Unlike @opentrattos/types
// (plain TS types), every export here ships a runtime validator.
//
// Each milestone gets its own subfolder (`m3/`, `m4/`, ...). Schemas
// are the source of truth; TS types are inferred via `z.infer<>`.
// ============================================================

export * from './m3/ai-obs';
export * from './m3/email';
export * from './m3/po';
