import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuthSession } from '@/lib/authContext';
import { colors } from '@/lib/theme';

export default function Index() {
  const { status } = useAuthSession();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
