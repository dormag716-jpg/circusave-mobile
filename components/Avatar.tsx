import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getInitials } from '../lib/initials';

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
    backgroundColor: '#f3e8ff', // A stable light purple background
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e9d5ff',
  },
  text: {
    color: '#7c3aed', // Matching dark purple text
    fontWeight: '800',
  },
});
