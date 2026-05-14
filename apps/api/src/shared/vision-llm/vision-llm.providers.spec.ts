import { randomUUID } from 'node:crypto';
import { ClaudeVisionProvider } from './claude-vision.provider';
import { NotImplementedError } from './errors';
import { GptFourVProvider } from './gpt-four-v.provider';
import { GptOssVisionRagProxyProvider } from './gpt-oss-vision-rag-proxy.provider';

const STUB_INPUT = {
  photoUrl: `https://example.com/${randomUUID()}.jpg`,
  tag: 'photo-ingest-batch',
  capability: 'inventory.ingest-invoice-photo',
};

describe('Vision-LLM adapter stubs (this slice ships interface only)', () => {
  it('GptOssVisionRagProxyProvider.extract throws NotImplementedError', async () => {
    const provider = new GptOssVisionRagProxyProvider();
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(NotImplementedError);
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(/slice #17a delivers/);
  });

  it('ClaudeVisionProvider.extract throws NotImplementedError', async () => {
    const provider = new ClaudeVisionProvider();
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(NotImplementedError);
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(/slice #17a delivers/);
  });

  it('GptFourVProvider.extract throws NotImplementedError', async () => {
    const provider = new GptFourVProvider();
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(NotImplementedError);
    await expect(provider.extract(STUB_INPUT)).rejects.toThrow(/slice #17a delivers/);
  });

  it('all three adapters expose id/modelName/modelVersion metadata', () => {
    const providers = [
      new GptOssVisionRagProxyProvider(),
      new ClaudeVisionProvider(),
      new GptFourVProvider(),
    ];
    for (const p of providers) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.modelName).toBe('string');
      expect(p.modelName.length).toBeGreaterThan(0);
      expect(typeof p.modelVersion).toBe('string');
      expect(p.modelVersion.length).toBeGreaterThan(0);
    }
  });
});
