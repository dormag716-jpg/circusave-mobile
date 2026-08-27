import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/lib/theme';

const SUPPORT_SECTIONS = [
  { id: 'gettingStarted', icon: 'rocket' },
  { id: 'dashboard', icon: 'home' },
  { id: 'circles', icon: 'users' },
  { id: 'contributions', icon: 'money' },
  { id: 'activity', icon: 'list-alt' },
  { id: 'settings', icon: 'cog' },
] as const;

export default function SupportScreen() {
  const { t } = useTranslation('support');
  const [expandedSection, setExpandedSection] = useState<string | null>(
    'contributions',
  );

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('backA11y')}
        >
          <FontAwesome name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('intro')}</Text>

        <View style={styles.accordion}>
          {SUPPORT_SECTIONS.map((section) => {
            const isExpanded = expandedSection === section.id;
            return (
              <View key={section.id} style={styles.sectionContainer}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => toggleSection(section.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={t(`sections.${section.id}.title`)}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.iconContainer}>
                      <FontAwesome name={section.icon as any} size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.sectionTitle}>
                      {t(`sections.${section.id}.title`)}
                    </Text>
                  </View>
                  <FontAwesome
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                
                {isExpanded && (
                  <View style={styles.sectionContent}>
                    <Text style={styles.contentText}>
                      {t(`sections.${section.id}.body`)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        
        <View style={styles.contactCard}>
          <FontAwesome name="envelope-o" size={24} color={colors.primary} />
          <Text style={styles.contactTitle}>{t('contactTitle')}</Text>
          <Text style={styles.contactText}>{t('contactText')}</Text>
          <Pressable style={styles.contactButton} onPress={() => alert('Emailing support@circusave.com')}>
            <Text style={styles.contactButtonText}>{t('contactAction')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    paddingBottom: 60,
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
  },
  intro: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  accordion: {
    gap: 12,
    marginBottom: 32,
  },
  sectionContainer: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  sectionHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: `${colors.primary}15`,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionContent: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    padding: 16,
    backgroundColor: `${colors.background}50`,
  },
  contentText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  contactCard: {
    alignItems: 'center',
    backgroundColor: `${colors.primary}10`,
    borderColor: `${colors.primary}30`,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 24,
  },
  contactTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  contactText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  contactButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  contactButtonText: {
    color: colors.onColor,
    fontSize: 16,
    fontWeight: '800',
  },
});
