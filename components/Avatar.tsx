import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getInitials } from '../lib/initials';
import { colors } from '../lib/theme';

interface AvatarProps {
  name?: string | null;
  size?: number;
}

export function Avatar({ name, size = 40 }: AvatarProps) {
  const initials = getInitials(name);
  const borderRadius = size / 2;
  const fontSize = size * 0.4;

  return (
    <View
      accessible={true}
      accessibilityLabel={`${name || 'Unknown'} avatar`}
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
