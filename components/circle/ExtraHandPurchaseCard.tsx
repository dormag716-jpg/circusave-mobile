import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { requestExtraHandQuote, verifyExtraHandPurchase } from '@/lib/api';
import {
  classifyQuoteFailure,
  runExtraHandPurchase,
  type ExtraHandPurchaseState,
  type ExtraHandQuote,
} from '@/lib/billing/extraHandPurchase';
import { googlePlayBilling } from '@/lib/billing/googlePlayBilling';
import { logClientWarning } from '@/lib/platform/errorLogging';
import { colors, radii, shadows, spacing } from '@/lib/shared/theme';

type Props = {
  token: string | undefined;
  circleId: string | undefined;
  /** Called once the backend has confirmed the hand, so the screen can reload. */
  onPurchased: () => void;
  /**
   * Which way to add this hand: 'purchase' (this card), 'request' (the
   * request-and-approve flow, for hands the plan includes or when purchases are
   * not offered) or 'none' (still loading, failed, or at the plan limit).
   */
  onMode?: (mode: 'purchase' | 'request' | 'none') => void;
};

type Offer =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'limit'; max: number | null }
  | { kind: 'failed' }
  | { kind: 'ready'; quote: ExtraHandQuote; price: string | null };

/**
 * Buying one extra hand with Google Play. The backend is asked first (quote);
 * the button exists only when it says yes. A hand is added only after the
 * backend confirms the payment with Google Play, never from this screen.
 */
export function ExtraHandPurchaseCard({ token, circleId, onPurchased, onMode }: Props) {
  const { t } = useTranslation('agreements');
  const isAndroid = Platform.OS === 'android';
  const [offer, setOffer] = useState<Offer>({ kind: 'loading' });
  const [flow, setFlow] = useState<ExtraHandPurchaseState>({ phase: 'idle' });
  const running = useRef(false);
  const lastPurchase = useRef<import('expo-iap').PurchaseAndroid | null>(null);

  const finishDone = useCallback(async () => {
    // Letting Play sell the product again; failure here never hides a verified hand.
    const purchase = lastPurchase.current;
    lastPurchase.current = null;
    if (purchase && isAndroid) {
      try {
        await googlePlayBilling.consumeOneTimePurchase(purchase);
      } catch {
        // The backend also consumes; a leftover is cleaned up on the next visit.
      }
    }
    onPurchased();
  }, [isAndroid, onPurchased]);

  const load = useCallback(async () => {
    if (!token || !circleId) {
      setOffer({ kind: 'hidden' });
      return;
    }
    setOffer({ kind: 'loading' });
    let quote: ExtraHandQuote;
    try {
      quote = await requestExtraHandQuote(token, circleId);
    } catch (error) {
      const outcome = classifyQuoteFailure(error);
      if (outcome.kind === 'not_offered') {
        setOffer({ kind: 'hidden' });
      } else if (outcome.kind === 'limit_reached') {
        const max =
          error &&
          typeof error === 'object' &&
          'payload' in error &&
          error.payload &&
          typeof error.payload === 'object' &&
          typeof (error.payload as Record<string, unknown>).maxHandsPerPerson === 'number'
            ? ((error.payload as Record<string, unknown>).maxHandsPerPerson as number)
            : null;
        setOffer({ kind: 'limit', max });
      } else {
        setOffer({ kind: 'failed' });
      }
      return;
    }

    let price: string | null = null;
    if (isAndroid) {
      try {
        const availability = await googlePlayBilling.getAvailability();
        if (availability.available) {
          await googlePlayBilling.connect();
          price = await googlePlayBilling.queryOneTimeProductPrice(quote.productId);
          await recoverPaidPurchases(token, quote);
        }
      } catch (error) {
        logClientWarning('Extra hand price lookup failed.', error);
        price = null;
      }
    }
    setOffer({ kind: 'ready', quote, price });
  }, [circleId, isAndroid, token]);

  /** A hand paid for but not added (app closed mid-way) is finished, never paid twice. */
  async function recoverPaidPurchases(authToken: string, quote: ExtraHandQuote) {
    const leftovers = await googlePlayBilling.getUnconsumedOneTimePurchases(quote.productId);
    for (const purchase of leftovers) {
      const reservationId = purchase.obfuscatedProfileIdAndroid;
      if (!reservationId || !purchase.purchaseToken) continue;
      try {
        await verifyExtraHandPurchase(authToken, {
          purchaseToken: purchase.purchaseToken,
          reservationId,
        });
        await googlePlayBilling.consumeOneTimePurchase(purchase).catch(() => undefined);
        onPurchased();
        return;
      } catch {
        // Not ours to settle here; the backend refuses what it cannot confirm.
      }
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onMode?.(
      offer.kind === 'ready' ? 'purchase' : offer.kind === 'hidden' ? 'request' : 'none',
    );
  }, [offer.kind, onMode]);

  async function buy(resume?: { quote: ExtraHandQuote; purchaseToken: string }) {
    if (!token || !circleId || running.current) return;
    running.current = true;
    try {
      const final = await runExtraHandPurchase(
        {
          quote: () => requestExtraHandQuote(token, circleId),
          pay: async (quote) => {
            const result = await googlePlayBilling.purchaseOneTimeProduct({
              productId: quote.productId,
              obfuscatedAccountId: quote.obfuscatedAccountId,
              obfuscatedProfileId: quote.obfuscatedProfileId,
            });
            if (result.kind === 'purchased') {
              lastPurchase.current = result.purchase;
              return { kind: 'purchased', purchaseToken: result.purchaseToken };
            }
            return { kind: result.kind };
          },
          verify: (input) => verifyExtraHandPurchase(token, input),
        },
        setFlow,
        resume,
      );
      if (final.phase === 'done') {
        await finishDone();
      }
    } catch (error) {
      logClientWarning('Extra hand purchase failed.', error);
      setFlow({ phase: 'failed', reason: 'payment_failed' });
    } finally {
      running.current = false;
    }
  }

  if (offer.kind === 'loading' || offer.kind === 'hidden') {
    return offer.kind === 'loading' ? (
      <ActivityIndicator color={colors.primary} />
    ) : null;
  }
  if (offer.kind === 'failed') {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>{t('extraHandQuoteFailed')}</Text>
        <Pressable style={styles.link} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.linkText}>{t('extraHandRetry')}</Text>
        </Pressable>
      </View>
    );
  }
  if (offer.kind === 'limit') {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>
          {offer.max
            ? t('extraHandLimit', { max: offer.max })
            : t('extraHandLimitGeneric')}
        </Text>
      </View>
    );
  }

  const { quote, price } = offer;
  const busy =
    flow.phase === 'quoting' || flow.phase === 'paying' || flow.phase === 'verifying';
  const canBuy = isAndroid && price !== null && !busy && flow.phase !== 'pending';
  const retryToken =
    flow.phase === 'failed' && flow.purchaseToken && flow.quote
      ? { quote: flow.quote, purchaseToken: flow.purchaseToken }
      : null;

  const message = (() => {
    switch (flow.phase) {
      case 'paying':
        return t('extraHandPaying');
      case 'verifying':
        return t('extraHandVerifying');
      case 'pending':
        return t('extraHandPending');
      case 'done':
        return t('extraHandDone');
      case 'limit_reached':
        return t('extraHandLimitGeneric');
      case 'not_offered':
        return t('extraHandNotOffered');
      case 'failed':
        return flow.reason === 'payment_canceled'
          ? t('extraHandCanceled')
          : flow.reason === 'payment_failed'
            ? t('extraHandPaymentFailed')
            : flow.reason === 'needs_review'
              ? t('extraHandNeedsReview')
              : flow.reason === 'verify'
                ? t('extraHandVerifyFailed')
                : t('extraHandQuoteFailed');
      default:
        return null;
    }
  })();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <FontAwesome name="plus-circle" size={18} color={colors.primary} />
        <Text style={styles.title}>{t('extraHandTitle')}</Text>
      </View>
      <Text style={styles.handOf}>
        {t('extraHandHandOf', { number: quote.handNumber, max: quote.maxHandsPerPerson })}
      </Text>
      <Text style={styles.body}>
        {price
          ? t('extraHandBody', { count: quote.handsIncluded, price })
          : isAndroid
            ? t('extraHandPriceUnavailable')
            : t('extraHandNotOnDevice')}
      </Text>

      {message ? (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}

      {retryToken ? (
        <Pressable
          style={styles.primary}
          onPress={() => void buy(retryToken)}
          accessibilityRole="button"
          accessibilityLabel={t('extraHandRetry')}
        >
          <Text style={styles.primaryText}>{t('extraHandRetry')}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.primary, !canBuy && styles.disabled]}
          disabled={!canBuy}
          onPress={() => void buy()}
          accessibilityRole="button"
          accessibilityLabel={price ? t('extraHandBuy', { price }) : t('extraHandTitle')}
          accessibilityState={{ disabled: !canBuy }}
        >
          {busy ? (
            <ActivityIndicator color={colors.onColor} />
          ) : (
            <Text style={styles.primaryText}>
              {price ? t('extraHandBuy', { price }) : t('extraHandTitle')}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.card,
    gap: 10,
    ...shadows.small,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textStrong, fontSize: 18, fontWeight: '800' },
  handOf: { color: colors.primaryDark, fontWeight: '800' },
  body: { color: colors.text, lineHeight: 20 },
  status: { color: colors.textStrong, fontWeight: '600' },
  primary: {
    backgroundColor: colors.primary,
    minHeight: 48,
    padding: 15,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onColor, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.4 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.primary, fontWeight: '700' },
});
