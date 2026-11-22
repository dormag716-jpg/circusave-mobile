import { useWindowDimensions } from 'react-native';

import { getLayoutMetrics, type LayoutMetrics } from '@/lib/shared/responsive';

/** Live layout metrics; updates on rotation, split screen and font scale changes. */
export function useLayoutMetrics(): LayoutMetrics {
  const { width, height, fontScale } = useWindowDimensions();
  return getLayoutMetrics({ width, height, fontScale });
}
