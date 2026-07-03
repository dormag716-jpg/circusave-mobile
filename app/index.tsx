import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuthSession } from '@/lib/authContext';

export default function Index() {
  const { status } = useAuthSession();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Redirect
      href={status === 'authenticated' ? '/(tabs)/dashboard' : '/login'}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
