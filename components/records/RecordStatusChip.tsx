import { Text, View } from 'react-native';

import type { StatusTone } from '@/lib/records/recordsPresentation';
import { colors } from '@/lib/shared/theme';

import { rs } from './recordsStyles';

const TONES: Record<StatusTone, { bg: string; fg: string; border: string }> = {
  success: { bg: colors.successSoft, fg: colors.successText, border: colors.successBorder },
  info: { bg: colors.infoSoft, fg: colors.infoText, border: colors.infoBorder },
  warning: { bg: colors.warningSoft, fg: colors.warningText, border: colors.warningBorder },
  danger: { bg: colors.dangerSoft, fg: colors.dangerText, border: colors.dangerBorder },
  neutral: { bg: colors.surfaceMuted, fg: colors.muted, border: colors.cardBorder },
};

export function RecordStatusChip({ label, tone }: { label: string; tone: StatusTone }) {
  const palette = TONES[tone];
  return (
    <View
      style={[rs.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessible
      accessibilityLabel={label}
    >
      <Text style={[rs.chipText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
