import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listLegalDocuments } from '@/lib/legal';
import { colors, shadows, spacing } from '@/lib/theme';

export default function LegalIndexScreen() {
  const documents = listLegalDocuments();

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
        <Text style={styles.title}>Legal & Policies</Text>
        <Text style={styles.subtitle}>
          Review CircuSave product policies, disclosures, and electronic consent.
          These documents are initial product-policy drafts and are not
          attorney-approved legal advice.
        </Text>

        <View style={styles.menuCard}>
          {documents.map((document, index) => {
            const isFirst = index === 0;
            const isLast = index === documents.length - 1;
            return (
              <Pressable
                key={document.id}
                style={({ pressed }) => [
                  styles.menuItem,
                  isFirst && styles.menuItemFirst,
                  isLast && styles.menuItemLast,
                  pressed && styles.menuItemPressed,
                ]}
                onPress={() => router.push(document.href)}
                accessibilityRole="button"
                accessibilityLabel={document.title}
              >
                <View style={styles.menuIconContainer}>
                  <FontAwesome name="file-text-o" size={18} color={colors.primary} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>{document.shortTitle}</Text>
                  <Text style={styles.menuSubtitle}>{document.subtitle}</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={colors.muted} />
              </Pressable>
            );
          })}
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
    paddingBottom: 48,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
  },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.small,
  },
  menuItem: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuItemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  menuItemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 0,
  },
  menuItemPressed: {
    backgroundColor: '#F1F5F9',
  },
  menuIconContainer: {
    alignItems: 'center',
    backgroundColor: `${colors.primary}10`,
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  menuText: {
    flex: 1,
    marginRight: 8,
  },
  menuTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  menuSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
});
