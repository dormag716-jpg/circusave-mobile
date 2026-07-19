import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href } from 'expo-router';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/lib/theme';

export type LegalCheckboxSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: Href };

type LegalCheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  segments: LegalCheckboxSegment[];
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function LegalCheckbox({
  checked,
  onCheckedChange,
  segments,
  accessibilityLabel,
  style,
  testID,
}: LegalCheckboxProps) {
  function openPolicyLink(event: GestureResponderEvent, href: Href) {
    // Opening a policy must never toggle acceptance.
    event.stopPropagation();
    router.push(href);
  }

  return (
    <Pressable
      testID={testID}
      onPress={() => onCheckedChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        style,
      ]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? (
          <FontAwesome name="check" size={14} color="#ffffff" />
        ) : null}
      </View>
      <Text style={styles.label}>
        {segments.map((segment, index) => {
          if (segment.type === 'link') {
            return (
              <Text
                key={`${segment.text}-${index}`}
                style={styles.link}
                onPress={(event) => openPolicyLink(event, segment.href)}
                accessibilityRole="link"
              >
                {segment.text}
              </Text>
            );
          }
          return <Text key={`${segment.text}-${index}`}>{segment.text}</Text>;
        })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.85,
  },
  box: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  link: {
    color: colors.primary,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
