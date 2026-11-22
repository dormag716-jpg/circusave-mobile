import { useEffect, useState } from 'react';

import {
  getAssistantEnabledState,
  loadAssistantEnabled,
  setAssistantEnabled,
  subscribeAssistantEnabled,
  type AssistantEnabledState,
} from '@/lib/assistant/assistantEnabledStore';

/**
 * The SuSu AI on/off preference. `ready` is true only once the saved choice has
 * been read and the assistant is on, so nothing flashes on screen for a user who
 * turned it off.
 */
export function useAssistantEnabled(): AssistantEnabledState & {
  ready: boolean;
  setEnabled: (next: boolean) => Promise<void>;
} {
  const [state, setState] = useState<AssistantEnabledState>(getAssistantEnabledState);

  useEffect(() => {
    const unsubscribe = subscribeAssistantEnabled(() =>
      setState(getAssistantEnabledState()),
    );
    void loadAssistantEnabled().then(() => setState(getAssistantEnabledState()));
    return unsubscribe;
  }, []);

  return { ...state, ready: state.loaded && state.enabled, setEnabled: setAssistantEnabled };
}
