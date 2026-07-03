import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { myCirclesHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

export default function CircleHistoryScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace(myCirclesHref)}
            accessibilityRole="button"
            accessibilityLabel="Back to My Circles"
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Circle records</Text>
            <Text style={styles.title}>Circle History</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>Circle history</Text>
          <Text style={styles.cardTitle}>Circle history is not available yet.</Text>
          <Text style={styles.body}>
            Completed circle history will appear here after the backend history
            endpoint is connected.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 20,
    padding: spacing.card,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
});
