import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getInitials } from '../lib/initials';
import { colors } from '../lib/theme';

interface AvatarProps {
  name?: string | null;
  size?: number;
}

export function Avatar({ name, size = 40 }: AvatarProps) {
  const { t } = useTranslation('common');
  const initials = getInitials(name);
  const borderRadius = size / 2;
  const fontSize = size * 0.4;
  const displayName = name?.trim() || t('unknown');

  return (
    <View
      accessible={true}
      accessibilityLabel={t('avatarA11y', { name: displayName })}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primaryBorder,
  },
  text: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
});
