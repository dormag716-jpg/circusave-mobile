import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the floating assistant button remembers its place, and a way for other
 * screens (Settings) to put it back to the default. The button listens for resets
 * so a reset takes effect immediately, without a restart.
 */
export const ASSISTANT_FAB_STORAGE_KEY = 'circusave.assistantFab.placement.v1';

type Listener = () => void;
const resetListeners = new Set<Listener>();

export function subscribeAssistantFabReset(listener: Listener): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

/** Forgets the saved place and tells the button to return to its default. */
export async function resetAssistantFabPlacement(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ASSISTANT_FAB_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the in-memory reset below still applies.
  }
  for (const listener of Array.from(resetListeners)) {
    listener();
  }
}
