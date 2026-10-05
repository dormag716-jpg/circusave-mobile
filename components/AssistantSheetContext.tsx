import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AssistantSheet } from '@/components/AssistantSheet';
import { useDeviceLock } from '@/components/DeviceLock';
import { useAuthSession } from '@/lib/auth/authContext';
import { AssistantCirclePicker } from '@/components/AssistantCirclePicker';
import { CircleAssistantPanel } from '@/components/CircleAssistantPanel';

type AssistantSheetApi = {
  /** With no circle id the sheet opens on a circle picker. */
  openAssistant: (circleId?: string | null) => void;
  closeAssistant: () => void;
  isOpen: boolean;
  circleId: string | null;
};

const AssistantSheetContext = createContext<AssistantSheetApi | null>(null);

export function AssistantSheetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuthSession();
  const { isLocked } = useDeviceLock();
  const [visible, setVisible] = useState(false);
  const [circleId, setCircleId] = useState<string | null>(null);
  // Bumped on lock or sign-out so the sheet and the chat inside it are unmounted
  // at once (no close animation), leaving no private messages in memory or in the
  // accessibility tree, and nothing mounted while navigation resets underneath.
  const [epoch, setEpoch] = useState(0);
  const mustBeClosed = isLocked || status !== 'authenticated';

  useEffect(() => {
    if (!mustBeClosed) return;
    setVisible(false);
    setCircleId(null);
    setEpoch((value) => value + 1);
  }, [mustBeClosed]);

  const openAssistant = useCallback(
    (nextCircleId?: string | null) => {
      if (mustBeClosed) return;
      const id = String(nextCircleId || '').trim();
      setCircleId(id || null);
      setVisible(true);
    },
    [mustBeClosed],
  );

  const closeAssistant = useCallback(() => {
    setVisible(false);
  }, []);

  const handleClosed = useCallback(() => {
    setVisible(false);
    setCircleId(null);
  }, []);

  const api = useMemo(
    () => ({
      openAssistant,
      closeAssistant,
      isOpen: visible,
      circleId,
    }),
    [openAssistant, closeAssistant, visible, circleId],
  );

  return (
    <AssistantSheetContext.Provider value={api}>
      {children}
      <AssistantSheet key={epoch} visible={visible} onClose={handleClosed}>
        {(requestClose) =>
          circleId ? (
            <CircleAssistantPanel
              circleId={circleId}
              presentation="sheet"
              onClose={requestClose}
            />
          ) : (
            <AssistantCirclePicker onPick={setCircleId} onClose={requestClose} />
          )
        }
      </AssistantSheet>
    </AssistantSheetContext.Provider>
  );
}

export function useAssistantSheet(): AssistantSheetApi {
  const ctx = useContext(AssistantSheetContext);
  if (!ctx) {
    throw new Error('useAssistantSheet requires AssistantSheetProvider');
  }
  return ctx;
}
