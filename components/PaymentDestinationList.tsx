import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { contributionCopy } from '@/lib/i18n/contributionCopy';
import {
  normalizePaymentDestinations,
  type PaymentDestination,
} from '@/lib/paymentDestinations';
import { colors } from '@/lib/theme';

export function PaymentDestinationList({
  destinations,
  fallbackText,
}: {
  destinations?: PaymentDestination[] | unknown;
  fallbackText?: string | null;
}) {
  const { t } = useTranslation(['contributions']);
  const rows = normalizePaymentDestinations(destinations);

  if (rows.length > 0) {
    return (
      <View style={styles.list}>
        {rows.map((destination, index) => (
          <View
            key={`${destination.method}-${destination.destination}-${index}`}
            style={styles.row}
          >
            <Text style={styles.method}>
              {contributionCopy(t, `paymentSetup.methods.${destination.method}`)}
            </Text>
            {destination.destination ? (
              <Text style={styles.destination}>{destination.destination}</Text>
            ) : null}
            {destination.memo ? (
              <Text style={styles.memo}>{destination.memo}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (fallbackText) {
    return <Text style={styles.destination}>{fallbackText}</Text>;
  }

  return null;
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { gap: 2 },
  method: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  destination: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
  },
  memo: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 2,
  },
});
