import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAssistantSheet } from '@/components/AssistantSheetContext';
import { circleWorkspaceHref, myCirclesHref } from '@/lib/platform/navigation';

/**
 * Link target only. The assistant lives in the floating bottom sheet, so this
 * route opens the sheet over the circle (or the circle list) and steps aside.
 */
export default function CircleAssistantScreen() {
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const { openAssistant } = useAssistantSheet();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    openAssistant(circleId || null);
    if (circleId) {
      router.replace(circleWorkspaceHref(circleId));
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(myCirclesHref);
    }
  }, [circleId, openAssistant]);

  return null;
}
