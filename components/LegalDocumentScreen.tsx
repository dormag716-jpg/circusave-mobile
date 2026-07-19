import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LegalSection } from '@/lib/legal';
import { colors, shadows, spacing } from '@/lib/theme';

type LegalDocumentScreenProps = {
  title: string;
  effectiveDateLabel: string;
  intro?: string;
  sections: LegalSection[];
  version?: string;
};

export function LegalDocumentScreen({
  title,
  effectiveDateLabel,
  intro,
  sections,
  version,
}: LegalDocumentScreenProps) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={18} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.effectiveDate}>{effectiveDateLabel}</Text>
          {version ? (
            <Text style={styles.version}>Document version {version}</Text>
          ) : null}
          <Text style={styles.draftNote}>
            Initial product-policy draft. Not attorney-approved legal advice.
          </Text>

          {intro ? <Text style={styles.intro}>{intro}</Text> : null}

          {sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  topBar: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 4,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
  },
  backText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 48,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    width: '100%',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    ...shadows.small,
  },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  effectiveDate: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  version: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  draftNote: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 16,
  },
  intro: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 8,
  },
  section: {
    marginTop: 18,
  },
  sectionHeading: {
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
});
