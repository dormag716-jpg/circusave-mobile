const getItem = jest.fn();
const setItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import {
  ASSISTANT_ENABLED_STORAGE_KEY,
  getAssistantEnabledState,
  loadAssistantEnabled,
  parseAssistantEnabled,
  resetAssistantEnabledForTests,
  setAssistantEnabled,
  subscribeAssistantEnabled,
} from '../assistantEnabledStore';

describe('SuSu AI on/off preference', () => {
  beforeEach(() => {
    resetAssistantEnabledForTests();
    getItem.mockReset();
    setItem.mockReset();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
  });

  it('is on by default and only an explicit false turns it off', () => {
    expect(parseAssistantEnabled(null)).toBe(true);
    expect(parseAssistantEnabled(undefined)).toBe(true);
    expect(parseAssistantEnabled('true')).toBe(true);
    expect(parseAssistantEnabled('garbage')).toBe(true);
    expect(parseAssistantEnabled('false')).toBe(false);
  });

  it('is not loaded until the saved choice has been read', async () => {
    expect(getAssistantEnabledState()).toEqual({ enabled: true, loaded: false });
    await loadAssistantEnabled();
    expect(getAssistantEnabledState()).toEqual({ enabled: true, loaded: true });
  });

  it('restores a saved "off"', async () => {
    getItem.mockResolvedValue('false');
    await loadAssistantEnabled();
    expect(getAssistantEnabledState()).toEqual({ enabled: false, loaded: true });
    expect(getItem).toHaveBeenCalledWith(ASSISTANT_ENABLED_STORAGE_KEY);
  });

  it('falls back to on when storage cannot be read', async () => {
    getItem.mockRejectedValue(new Error('storage unavailable'));
    await loadAssistantEnabled();
    expect(getAssistantEnabledState()).toEqual({ enabled: true, loaded: true });
  });

  it('reads storage only once', async () => {
    await loadAssistantEnabled();
    await loadAssistantEnabled();
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('applies a change at once, saves it, and tells subscribers', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAssistantEnabled(listener);
    await setAssistantEnabled(false);
    expect(getAssistantEnabledState()).toEqual({ enabled: false, loaded: true });
    expect(setItem).toHaveBeenCalledWith(ASSISTANT_ENABLED_STORAGE_KEY, 'false');
    expect(listener).toHaveBeenCalledTimes(1);
    await setAssistantEnabled(true);
    expect(setItem).toHaveBeenLastCalledWith(ASSISTANT_ENABLED_STORAGE_KEY, 'true');
    unsubscribe();
  });

  it('keeps the choice for this session when saving fails', async () => {
    setItem.mockRejectedValue(new Error('storage unavailable'));
    await expect(setAssistantEnabled(false)).resolves.toBeUndefined();
    expect(getAssistantEnabledState().enabled).toBe(false);
  });

  it('keeps a choice made while the saved value was still loading', async () => {
    let release: (value: string | null) => void = () => undefined;
    getItem.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const pending = loadAssistantEnabled();
    await setAssistantEnabled(false);
    release('true');
    await pending;
    expect(getAssistantEnabledState().enabled).toBe(false);
  });

  it('stops notifying after unsubscribe', async () => {
    const listener = jest.fn();
    subscribeAssistantEnabled(listener)();
    await setAssistantEnabled(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
