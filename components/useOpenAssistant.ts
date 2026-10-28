import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAssistantSheet } from '@/components/AssistantSheetContext';
import { getCircles } from '@/lib/api';
import { assistantFabCircleId } from '@/lib/assistant/assistantFab';
import { useAuthSession } from '@/lib/auth/authContext';

/**
 * Opens the assistant sheet for the right circle: the circle on screen, the only
 * circle the user has, or (with several, or when the list cannot be read) the
 * circle picker. Shared by the floating button and the Settings entry so both
 * behave the same.
 */
export function useOpenAssistant(): { open: () => Promise<void>; opening: boolean } {
  const { session } = useAuthSession();
  const { openAssistant } = useAssistantSheet();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ circleId?: string | string[] }>();
  const token = session?.session.token;
  const [opening, setOpening] = useState(false);

  const open = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      const routeCircleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
      const onCircleScreen =
        String(pathname || '').startsWith('/circle/') && Boolean(routeCircleId);
      let circleIds: string[] = [];
      if (!onCircleScreen && token) {
        const circles = await getCircles(token);
        circleIds = (circles || [])
          .filter((circle) => String(circle.userRole || '').toLowerCase() !== 'waitlist')
          .map((circle) => circle.id);
      }
      openAssistant(assistantFabCircleId({ pathname, routeCircleId, circleIds }));
    } catch {
      // Could not load circles: let the sheet ask, and retry there.
      openAssistant(null);
    } finally {
      setOpening(false);
    }
  }, [opening, params.circleId, pathname, token, openAssistant]);

  return { open, opening };
}
