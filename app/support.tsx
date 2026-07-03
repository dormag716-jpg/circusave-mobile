import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/lib/theme';

const supportSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket',
    content: `Welcome to CircuSave! To begin, make sure your profile is complete. 
    
1. Go to the Profile tab.
2. Check your display name and email.
3. Configure your Security settings (highly recommended to enable Device Lock for privacy).`,
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    icon: 'home',
    content: `Your Dashboard gives you a quick snapshot of your financial activity.

• Total Saved: Lifetime total of all payouts you've received across all completed rounds.
• Active Circles: The number of circles you are currently participating in.
• Upcoming Action: If you have a contribution due, or if you are scheduled to receive a payout, it will appear front and center on the Dashboard.`,
  },
  {
    id: 'circles',
    title: 'Circles & Rounds',
    icon: 'users',
    content: `A Circle is a group saving pool (often known as a Susu, Tanda, or Pardner). 
    
Creating a Circle (Organizer):
1. Tap the '+' Create tab at the bottom.
2. Set the Circle Name, Contribution Amount (how much each person pays per round), and Frequency (Weekly, Biweekly, or Monthly).
3. Invite members to join.
4. Once members accept, you can start the first Round!

Joining a Circle (Member):
1. When invited, the Circle will appear on your Circles tab under "Pending Invites".
2. Accept the invite to join.
3. Wait for the Organizer to start the round.`,
  },
  {
    id: 'contributions',
    title: 'Contributions & Payouts',
    icon: 'money',
    content: `Managing money flow in a Round:

Members:
1. When a round starts, your contribution is "Due".
2. Make your payment to the Organizer outside the app (e.g., CashApp, Zelle, Cash).
3. Tap "I Sent It" in the Circle Workspace to submit your contribution for review.

Organizers:
1. Review submitted contributions.
2. Confirm receipt once the funds actually arrive in your account.
3. When all members have paid, the "Release Payout" button unlocks.
4. Send the total collected pot to the recipient for that round!`,
  },
  {
    id: 'activity',
    title: 'Activity & Records',
    icon: 'list-alt',
    content: `Keeping track of payments:

• The Global Activity Tab (bottom menu) shows a chronological feed of all your personal contributions and payouts across all circles.
• The Circle Records Tab (inside a Circle Workspace) shows the immutable ledger for that specific circle, ensuring full transparency for all members.`,
  },
  {
    id: 'settings',
    title: 'Settings & Security',
    icon: 'cog',
    content: `Customizing your experience:

• Cultural Terminology: Go to Profile -> Cultural Terminology to change what the app calls a Circle (e.g., Susu, Tanda) to match your heritage.
• Security: Go to Profile -> Security to enable FaceID, TouchID, or PIN locks, ensuring your financial data stays private.
• Subscription: Manage your organizer limits (Free vs Premium) in the Subscription menu.`,
  },
];

export default function SupportScreen() {
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');

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
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Help & Support</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Step-by-step guides and documentation to help you get the most out of CircuSave.
        </Text>

        <View style={styles.accordion}>
          {supportSections.map((section) => {
            const isExpanded = expandedSection === section.id;
            return (
              <View key={section.id} style={styles.sectionContainer}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => toggleSection(section.id)}
                  accessibilityRole="button"
                >
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.iconContainer}>
                      <FontAwesome name={section.icon as any} size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </View>
                  <FontAwesome
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                
                {isExpanded && (
                  <View style={styles.sectionContent}>
                    <Text style={styles.contentText}>{section.content}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        
        <View style={styles.contactCard}>
          <FontAwesome name="envelope-o" size={24} color={colors.primary} />
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>
            Our support team is here for you. Reach out to us with any questions or issues.
          </Text>
          <Pressable style={styles.contactButton} onPress={() => alert('Emailing support@circusave.com')}>
            <Text style={styles.contactButtonText}>Contact Support</Text>
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
