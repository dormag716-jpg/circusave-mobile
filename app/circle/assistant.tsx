import { useLocalSearchParams } from 'expo-router';

import { CircleAssistantPanel } from '@/components/CircleAssistantPanel';

/**
 * Deep-link / full-page entry. Primary open path is the floating sheet from home.
 */
export default function CircleAssistantScreen() {
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  return <CircleAssistantPanel circleId={circleId} presentation="page" />;
}
