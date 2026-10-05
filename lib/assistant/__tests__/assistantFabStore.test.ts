const removeItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { removeItem: (...args: unknown[]) => removeItem(...args) },
}));

import {
  ASSISTANT_FAB_STORAGE_KEY,
  resetAssistantFabPlacement,
  subscribeAssistantFabReset,
} from '../assistantFabStore';

describe('assistant button reset', () => {
  beforeEach(() => {
    removeItem.mockReset();
    removeItem.mockResolvedValue(undefined);
  });

  it('forgets the saved place and tells the button to go back to its default', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAssistantFabReset(listener);
    await resetAssistantFabPlacement();
    expect(removeItem).toHaveBeenCalledWith(ASSISTANT_FAB_STORAGE_KEY);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', async () => {
    const listener = jest.fn();
    subscribeAssistantFabReset(listener)();
    await resetAssistantFabPlacement();
    expect(listener).not.toHaveBeenCalled();
  });

  it('still resets the button when storage is unavailable', async () => {
    removeItem.mockRejectedValue(new Error('storage unavailable'));
    const listener = jest.fn();
    const unsubscribe = subscribeAssistantFabReset(listener);
    await expect(resetAssistantFabPlacement()).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifies every subscriber', async () => {
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = subscribeAssistantFabReset(a);
    const unsubB = subscribeAssistantFabReset(b);
    await resetAssistantFabPlacement();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});
