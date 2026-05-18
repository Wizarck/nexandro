import { api } from './client';

/**
 * Sprint 4 W1-B — frontend bindings for `/m3/haccp/fsms-standards/*`.
 *
 * Backed by `apps/api/src/haccp/interface/fsms-standard.controller.ts`. The
 * controller is OWNER-only and append-only per design.md Decision A
 * (republish creates a new row; existing rows are immutable). This client
 * exposes the list endpoint only — authoring CCP definitions inline from the
 * Settings tab is followup (j10 picker authoring already covers the wizard).
 */

export type CcpInputType = 'numeric' | 'checkbox' | 'multi-select' | 'range';

export const CCP_INPUT_TYPES: ReadonlyArray<CcpInputType> = [
  'numeric',
  'checkbox',
  'multi-select',
  'range',
] as const;

export interface CcpDefinition {
  id: string;
  label: string;
  inputType: CcpInputType;
  unit?: string;
  specMin?: number;
  specMax?: number;
  expectedOptions?: string[];
  recommendedCorrectiveActionIds?: string[];
}

export interface FsmsStandardResponse {
  id: string;
  organizationId: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  ccpDefinitions: CcpDefinition[];
  createdAt: string;
}

interface ListEnvelope {
  fsmsStandards: FsmsStandardResponse[];
}

export async function listFsmsStandards(
  organizationId: string,
  name?: string,
): Promise<FsmsStandardResponse[]> {
  const q = new URLSearchParams({ organizationId });
  if (name) q.set('name', name);
  const env = await api<ListEnvelope>(
    `/m3/haccp/fsms-standards?${q.toString()}`,
  );
  return env.fsmsStandards;
}
