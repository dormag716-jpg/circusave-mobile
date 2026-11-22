import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The on/off switch for SuSu AI on this device. It is a display preference:
 * when off, the floating button is gone and the assistant sheet cannot be
 * opened from anywhere. It never changes the account, the plan, or anything the
 * backend owns. It defaults to on, and anything unreadable also means on.
 */
export const ASSISTANT_ENABLED_STORAGE_KEY = 'circusave.assistant.enabled.v1';

export type AssistantEnabledState = { enabled: boolean; loaded: boolean };

type Listener = () => void;

let enabled = true;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<Listener>();

/** Only an explicit "false" turns the assistant off. */
export function parseAssistantEnabled(raw: string | null | undefined): boolean {
  return raw !== 'false';
}

function notify() {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function getAssistantEnabledState(): AssistantEnabledState {
  return { enabled, loaded };
}

export function subscribeAssistantEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads the saved choice once. Safe to call from many places. */
export function loadAssistantEnabled(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = AsyncStorage.getItem(ASSISTANT_ENABLED_STORAGE_KEY)
      .then((raw) => parseAssistantEnabled(raw))
      .catch(() => true)
      .then((value) => {
        // A choice made while the read was in flight wins over the stored value.
        if (!loaded) {
          enabled = value;
          loaded = true;
          notify();
        }
      });
  }
  return loading;
}

/** Applies the choice at once, then saves it. A failed save keeps it for this session. */
export async function setAssistantEnabled(next: boolean): Promise<void> {
  enabled = next;
  loaded = true;
  notify();
  try {
    await AsyncStorage.setItem(ASSISTANT_ENABLED_STORAGE_KEY, next ? 'true' : 'false');
  } catch {
    // Storage may be unavailable; the in-memory choice still applies.
  }
}

/** Test only: forget everything so each test starts clean. */
export function resetAssistantEnabledForTests(): void {
  enabled = true;
  loaded = false;
  loading = null;
  listeners.clear();
}
