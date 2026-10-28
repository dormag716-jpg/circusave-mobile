import {
  isSystemPromptActive,
  resetSystemPromptGuard,
  runSystemPrompt,
} from '../systemPromptGuard';

describe('systemPromptGuard', () => {
  beforeEach(() => resetSystemPromptGuard());

  it('is off by default', () => {
    expect(isSystemPromptActive(1_000_000)).toBe(false);
  });

  it('is on while a prompt is open and settles shortly after it closes', async () => {
    let now = 10_000;
    let release: () => void = () => undefined;
    const pending = runSystemPrompt(
      () => new Promise<void>((resolve) => { release = resolve; }),
      () => now,
    );
    expect(isSystemPromptActive(now + 5_000)).toBe(true);
    now = 12_000;
    release();
    await pending;
    expect(isSystemPromptActive(12_500)).toBe(true);
    expect(isSystemPromptActive(14_000)).toBe(false);
  });

  it('turns off even if the prompt throws', async () => {
    await expect(
      runSystemPrompt(() => Promise.reject(new Error('boom')), () => 5_000),
    ).rejects.toThrow('boom');
    expect(isSystemPromptActive(5_000 + 5_000)).toBe(false);
  });

  it('expires after a minute so it cannot hold the app unlocked forever', () => {
    let release: () => void = () => undefined;
    void runSystemPrompt(() => new Promise<void>((resolve) => { release = resolve; }), () => 1_000);
    expect(isSystemPromptActive(30_000)).toBe(true);
    expect(isSystemPromptActive(1_000 + 61_000)).toBe(false);
    release();
  });

  it('returns the prompt result', async () => {
    await expect(runSystemPrompt(async () => 42)).resolves.toBe(42);
  });
});
