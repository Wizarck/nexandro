export class AiSuggestionsDisabledError extends Error {
  constructor() {
    super('AI yield suggestions are disabled (NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false)');
    this.name = 'AiSuggestionsDisabledError';
  }
}

export class AiSuggestionNotFoundError extends Error {
  readonly suggestionId: string;
  constructor(suggestionId: string) {
    super(`Suggestion not found: ${suggestionId}`);
    this.name = 'AiSuggestionNotFoundError';
    this.suggestionId = suggestionId;
  }
}

export class AiSuggestionAlreadyActedError extends Error {
  readonly suggestionId: string;
  readonly status: string;
  constructor(suggestionId: string, status: string) {
    super(`Suggestion ${suggestionId} already acted (status=${status})`);
    this.name = 'AiSuggestionAlreadyActedError';
    this.suggestionId = suggestionId;
    this.status = status;
  }
}

export class AiSuggestionRejectReasonError extends Error {
  readonly minLength: number;
  constructor(minLength: number) {
    super(`Reject reason must be ≥${minLength} chars`);
    this.name = 'AiSuggestionRejectReasonError';
    this.minLength = minLength;
  }
}

export class AiSuggestionTweakValueError extends Error {
  constructor() {
    super('Tweak value must be a finite number in [0, 1]');
    this.name = 'AiSuggestionTweakValueError';
  }
}
