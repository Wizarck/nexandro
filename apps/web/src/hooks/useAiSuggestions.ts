import { useMutation } from '@tanstack/react-query';
import type { AiSuggestionShape } from '@nexandro/ui-kit';
import { ApiError, api } from '../api/client';

export interface SuggestionEnvelope {
  suggestion: (AiSuggestionShape & { acceptedValue?: number | null }) | null;
  reason?: 'no_citation_available' | 'provider_unavailable';
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export interface SuggestYieldInput {
  organizationId: string;
  ingredientId: string;
  contextHash: string;
}

export interface SuggestWasteInput {
  organizationId: string;
  recipeId: string;
  contextHash: string;
}

/** Mutation: POST /ai-suggestions/yield → wrapped envelope. */
export function useYieldSuggestion() {
  return useMutation<SuggestionEnvelope, ApiError, SuggestYieldInput>({
    mutationFn: async (input) => {
      const wrap = await api<WriteEnvelope<SuggestionEnvelope>>('/ai-suggestions/yield', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return wrap.data;
    },
  });
}

/** Mutation: POST /ai-suggestions/waste → wrapped envelope. */
export function useWasteSuggestion() {
  return useMutation<SuggestionEnvelope, ApiError, SuggestWasteInput>({
    mutationFn: async (input) => {
      const wrap = await api<WriteEnvelope<SuggestionEnvelope>>('/ai-suggestions/waste', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return wrap.data;
    },
  });
}

export interface AcceptInput {
  organizationId: string;
  suggestionId: string;
  /** Tweak value as a fraction in [0, 1]. Omit to accept as-is. */
  value?: number;
}

export function useAcceptAiSuggestion() {
  return useMutation<AiSuggestionShape, ApiError, AcceptInput>({
    mutationFn: async ({ organizationId, suggestionId, value }) => {
      const wrap = await api<WriteEnvelope<AiSuggestionShape>>(
        `/ai-suggestions/${suggestionId}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId, value }),
        },
      );
      return wrap.data;
    },
  });
}

export interface RejectInput {
  organizationId: string;
  suggestionId: string;
  /** Audit reason ≥10 chars. */
  reason: string;
}

export function useRejectAiSuggestion() {
  return useMutation<AiSuggestionShape, ApiError, RejectInput>({
    mutationFn: async ({ organizationId, suggestionId, reason }) => {
      const wrap = await api<WriteEnvelope<AiSuggestionShape>>(
        `/ai-suggestions/${suggestionId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId, reason }),
        },
      );
      return wrap.data;
    },
  });
}
