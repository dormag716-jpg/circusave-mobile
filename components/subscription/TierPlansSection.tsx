import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PlanTier } from '@/lib/billing/entitlements';
import type {
  GooglePlayPlan,
  GooglePlayTierPlanKey,
} from '@/lib/billing/googlePlayBillingMachine';
import { tierCardAction, tierCardLimits } from '@/lib/billing/tierPlanCards';
import { colors, radii } from '@/lib/shared/theme';

type PaidTier = Exclude<PlanTier, 'free'>;
type Interval = 'monthly' | 'annual';

export type TierPlansSectionProps = {
  tierPlans: Partial<Record<GooglePlayTierPlanKey, GooglePlayPlan>>;
  currentTier: PlanTier;
  /** Set only while a switch is scheduled (see Entitlements.pendingTier). */
  pendingTier?: PaidTier;
  /** Already formatted for the person, or null when Google gave no date. */
  pendingDateLabel?: string | null;
  busy: boolean;
  canPurchase: boolean;
  periodLabel: (period: string | null) => string;
  onPurchase: (key: GooglePlayTierPlanKey) => void;
  onManage: () => void;
};

const PAID_TIERS: PaidTier[] = ['member_pro', 'organizer_pro'];

function tierName(t: (key: string) => string, tier: PlanTier): string {
  return tier === 'free'
    ? t('tierFreeName')
    : tier === 'member_pro'
      ? t('tierMemberProName')
      : t('tierOrganizerProName');
}

/**
 * The three-plan chooser. Prices and period text come only from Google Play;
 * the plan the person is on and any scheduled switch come only from the backend.
 */
export function TierPlansSection({
  tierPlans,
  currentTier,
  pendingTier,
  pendingDateLabel,
  busy,
  canPurchase,
  periodLabel,
  onPurchase,
  onManage,
}: TierPlansSectionProps) {
  const { t } = useTranslation('subscription');
  const [interval, setInterval] = useState<Interval>('annual');
  const translate = (key: string) => t(key);

  const cards: PlanTier[] = ['free', ...PAID_TIERS];

  return (
    <View style={styles.wrap}>
      <View style={styles.toggle}>
        {(['monthly', 'annual'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setInterval(value)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: interval === value, disabled: busy }}
            style={[styles.toggleButton, interval === value && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, interval === value && styles.toggleTextActive]}>
              {t(value)}
            </Text>
          </Pressable>
        ))}
      </View>

      {pendingTier ? (
        <View style={styles.pending} accessibilityLiveRegion="polite">
          <Text style={styles.pendingText}>
            {pendingDateLabel
              ? t('tierPendingLine', {
                  plan: tierName(translate, pendingTier),
                  date: pendingDateLabel,
                })
              : t('tierPendingLineNoDate', { plan: tierName(translate, pendingTier) })}
          </Text>
        </View>
      ) : null}

      {cards.map((tier) => {
        const limits = tierCardLimits(tier);
        const action = tierCardAction(currentTier, tier);
        const plan =
          tier === 'free'
            ? null
            : (tierPlans[`${tier}_${interval}` as GooglePlayTierPlanKey] ?? null);
        const isCurrent = action === 'current_free' || action === 'current_paid';
        const label =
          action === 'upgrade'
            ? t('tierUpgrade', { plan: tierName(translate, tier) })
            : action === 'switch_at_renewal'
              ? t('tierSwitchAtRenewal', { plan: tierName(translate, tier) })
              : t('tierChoose', { plan: tierName(translate, tier) });
        const showBuy =
          plan !== null &&
          (action === 'choose' || action === 'upgrade' || action === 'switch_at_renewal');

        return (
          <View key={tier} style={[styles.card, isCurrent && styles.cardCurrent]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{tierName(translate, tier)}</Text>
              {isCurrent ? (
                <Text style={styles.currentBadge}>{t('tierCurrent')}</Text>
              ) : null}
            </View>

            {plan ? (
              <View style={styles.priceRow}>
                <Text style={styles.price}>{plan.displayPrice}</Text>
                {plan.billingPeriod ? (
                  <Text style={styles.period}>
                    {t('playBillingPeriod', { period: periodLabel(plan.billingPeriod) })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.line}>
              {t('tierMembers', { count: limits.maxMembersPerCircle })}
            </Text>
            <Text style={styles.line}>
              {t('tierHands', {
                included: limits.handsIncluded,
                max: limits.maxHandsPerPerson,
              })}
            </Text>
            <Text style={styles.line}>
              {t('tierOpenCircles', { count: limits.maxOpenCircles })}
            </Text>

            {showBuy ? (
              <>
                <Pressable
                  style={[styles.button, (!canPurchase || busy) && styles.buttonDisabled]}
                  disabled={!canPurchase || busy}
                  onPress={() => onPurchase(`${tier}_${interval}` as GooglePlayTierPlanKey)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: !canPurchase || busy }}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <Text style={styles.buttonText}>{label}</Text>
                  )}
                </Pressable>
                {action === 'upgrade' ? (
                  <Text style={styles.note}>{t('tierUpgradeNote')}</Text>
                ) : null}
                {action === 'switch_at_renewal' ? (
                  <Text style={styles.note}>{t('tierDowngradeNote')}</Text>
                ) : null}
              </>
            ) : null}

            {action === 'current_paid' ? (
              <Pressable
                style={styles.linkButton}
                onPress={onManage}
                accessibilityRole="button"
                accessibilityLabel={t('tierManage')}
              >
                <Text style={styles.linkText}>{t('tierManage')}</Text>
              </Pressable>
            ) : null}

            {tier !== 'free' && !plan && action !== 'current_paid' ? (
              <Text style={styles.note}>{t('playUnavailableBody')}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 16 },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: radii.pill,
    padding: 4,
  },
  toggleButton: { minHeight: 44, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 999 },
  toggleButtonActive: { backgroundColor: colors.primaryDark },
  toggleText: { fontWeight: '700', color: colors.textStrong },
  toggleTextActive: { color: colors.onColor },
  pending: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, padding: 14 },
  pendingText: { color: colors.textStrong, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(107,70,193,0.10)',
  },
  cardCurrent: { borderColor: colors.primaryDark, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.textStrong },
  currentBadge: { fontSize: 11, fontWeight: '800', color: colors.primaryDark },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 4 },
  price: { fontSize: 30, fontWeight: '800', color: colors.textStrong },
  period: { color: colors.textStrong, opacity: 0.7 },
  line: { color: colors.textStrong, fontSize: 14, lineHeight: 20 },
  note: { color: colors.textStrong, opacity: 0.7, fontSize: 12, lineHeight: 17, marginTop: 4 },
  button: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onColor, fontWeight: '800' },
  linkButton: { minHeight: 44, justifyContent: 'center', marginTop: 6 },
  linkText: { color: colors.primaryDark, fontWeight: '700' },
});
