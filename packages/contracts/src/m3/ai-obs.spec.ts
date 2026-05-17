import {
  OpenTrattOsTagAttribute,
  OtelSpanAttributes,
  VisionLlmInput,
  VisionLlmOutput,
} from './ai-obs';

describe('OpenTrattOsTagAttribute', () => {
  it('accepts kebab-case ASCII values', () => {
    expect(OpenTrattOsTagAttribute.safeParse('photo-ingest-batch').success).toBe(true);
    expect(OpenTrattOsTagAttribute.safeParse('recall-investigation').success).toBe(true);
    expect(OpenTrattOsTagAttribute.safeParse('a').success).toBe(true);
    expect(OpenTrattOsTagAttribute.safeParse('ai-yield-suggestion').success).toBe(true);
  });

  it('rejects capitalized / spaced values', () => {
    expect(OpenTrattOsTagAttribute.safeParse('Photo Ingest BATCH!').success).toBe(false);
    expect(OpenTrattOsTagAttribute.safeParse('photo_ingest').success).toBe(false);
    expect(OpenTrattOsTagAttribute.safeParse('photo ingest').success).toBe(false);
  });

  it('rejects leading/trailing/double hyphens', () => {
    expect(OpenTrattOsTagAttribute.safeParse('-photo').success).toBe(false);
    expect(OpenTrattOsTagAttribute.safeParse('photo-').success).toBe(false);
    expect(OpenTrattOsTagAttribute.safeParse('photo--ingest').success).toBe(false);
  });

  it('rejects strings exceeding 64 chars', () => {
    const sixtyFive = 'a' + 'b'.repeat(64);
    expect(sixtyFive.length).toBe(65);
    expect(OpenTrattOsTagAttribute.safeParse(sixtyFive).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(OpenTrattOsTagAttribute.safeParse('').success).toBe(false);
  });
});

describe('OtelSpanAttributes', () => {
  it('accepts a minimal gen_ai.* span attribute object', () => {
    const parsed = OtelSpanAttributes.safeParse({
      'gen_ai.system': 'anthropic',
      'gen_ai.request.model': 'claude-3-5-sonnet',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a full attribute set including nexandro.tag', () => {
    const parsed = OtelSpanAttributes.safeParse({
      'gen_ai.system': 'openai',
      'gen_ai.request.model': 'gpt-4o',
      'gen_ai.response.model': 'gpt-4o-2024-08-06',
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.output_tokens': 50,
      'gen_ai.operation.name': 'chat',
      'nexandro.tag': 'photo-ingest-batch',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects negative token counts', () => {
    const parsed = OtelSpanAttributes.safeParse({
      'gen_ai.system': 'anthropic',
      'gen_ai.request.model': 'claude-3-5-sonnet',
      'gen_ai.usage.input_tokens': -1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('VisionLlmInput', () => {
  it('accepts photoUrl + tag + capability', () => {
    const parsed = VisionLlmInput.safeParse({
      photoUrl: 'https://example.com/photo.jpg',
      tag: 'photo-ingest-batch',
      capability: 'inventory.ingest-invoice-photo',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts photoBytes + tag + capability', () => {
    const parsed = VisionLlmInput.safeParse({
      photoBytes: new Uint8Array([1, 2, 3]),
      tag: 'photo-ingest-batch',
      capability: 'inventory.ingest-invoice-photo',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects input with neither photoBytes nor photoUrl', () => {
    const parsed = VisionLlmInput.safeParse({
      tag: 'photo-ingest-batch',
      capability: 'inventory.ingest-invoice-photo',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects input with invalid tag', () => {
    const parsed = VisionLlmInput.safeParse({
      photoUrl: 'https://example.com/photo.jpg',
      tag: 'Photo Ingest!',
      capability: 'inventory.ingest-invoice-photo',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('VisionLlmOutput', () => {
  it('accepts an output with fields + confidence', () => {
    const parsed = VisionLlmOutput.safeParse({
      fields: [
        { name: 'total', value: 12.5, confidence: 0.92 },
        { name: 'supplier', value: 'Acme', confidence: 0.78 },
        { name: 'unreadable', value: null, confidence: 0.05 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty fields array (whole-output null is the outage path, not empty fields)', () => {
    const parsed = VisionLlmOutput.safeParse({ fields: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejects confidence outside [0, 1]', () => {
    const parsed = VisionLlmOutput.safeParse({
      fields: [{ name: 'x', value: 'y', confidence: 1.5 }],
    });
    expect(parsed.success).toBe(false);
  });
});
