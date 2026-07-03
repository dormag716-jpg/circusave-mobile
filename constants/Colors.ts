import { colors as themeColors } from '@/lib/theme';

export default {
  light: {
    ...themeColors,
    tint: themeColors.primary,
    tabIconDefault: themeColors.subtle,
    tabIconSelected: themeColors.primary,
  },
  dark: {
    text: '#F1F5F9',
    background: '#0F172A',
    card: '#1E2937',
    tint: '#A78BFA',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#A78BFA',
  },
};
