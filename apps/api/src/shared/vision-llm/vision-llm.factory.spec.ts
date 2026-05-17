import { ClaudeVisionProvider } from './claude-vision.provider';
import { GptFourVProvider } from './gpt-four-v.provider';
import { GptOssVisionRagProxyProvider } from './gpt-oss-vision-rag-proxy.provider';
import { UnknownVisionLlmProviderError } from './errors';
import { VisionLlmFactory } from './vision-llm.factory';

function build(): VisionLlmFactory {
  return new VisionLlmFactory(
    new GptOssVisionRagProxyProvider(),
    new ClaudeVisionProvider(),
    new GptFourVProvider(),
  );
}

describe('VisionLlmFactory (env-driven adapter selection)', () => {
  const originalEnv = process.env.NEXANDRO_VISION_LLM_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXANDRO_VISION_LLM_PROVIDER;
    } else {
      process.env.NEXANDRO_VISION_LLM_PROVIDER = originalEnv;
    }
  });

  it('defaults to GptOssVisionRagProxyProvider when env is unset', () => {
    delete process.env.NEXANDRO_VISION_LLM_PROVIDER;
    const provider = build().getProvider();
    expect(provider).toBeInstanceOf(GptOssVisionRagProxyProvider);
    expect(provider.id).toBe('gpt-oss-vision-rag-proxy');
  });

  it('defaults to GptOssVisionRagProxyProvider when env is empty string', () => {
    process.env.NEXANDRO_VISION_LLM_PROVIDER = '   ';
    expect(build().getProvider()).toBeInstanceOf(GptOssVisionRagProxyProvider);
  });

  it('selects ClaudeVisionProvider for env=claude-vision', () => {
    process.env.NEXANDRO_VISION_LLM_PROVIDER = 'claude-vision';
    const provider = build().getProvider();
    expect(provider).toBeInstanceOf(ClaudeVisionProvider);
    expect(provider.id).toBe('claude-vision');
  });

  it('selects GptFourVProvider for env=gpt-four-v', () => {
    process.env.NEXANDRO_VISION_LLM_PROVIDER = 'gpt-four-v';
    const provider = build().getProvider();
    expect(provider).toBeInstanceOf(GptFourVProvider);
    expect(provider.id).toBe('gpt-four-v');
  });

  it('throws UnknownVisionLlmProviderError at construction (NOT at first call) for unknown env value', () => {
    process.env.NEXANDRO_VISION_LLM_PROVIDER = 'acme-vision';
    expect(() => build()).toThrow(UnknownVisionLlmProviderError);
    expect(() => build()).toThrow(/acme-vision/);
    expect(() => build()).toThrow(
      /expected one of: gpt-oss-vision-rag-proxy, claude-vision, gpt-four-v/,
    );
  });

  it('caches the resolved provider (same instance on repeated getProvider calls)', () => {
    process.env.NEXANDRO_VISION_LLM_PROVIDER = 'claude-vision';
    const factory = build();
    expect(factory.getProvider()).toBe(factory.getProvider());
  });
});
