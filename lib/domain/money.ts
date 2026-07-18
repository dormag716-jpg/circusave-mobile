export type CurrencyCode = 'USD';

/** Integer minor units only (for USD, cents). */
export type Money = Readonly<{
  amountMinor: number;
  currency: CurrencyCode;
}>;

export function money(amountMinor: number, currency: CurrencyCode = 'USD'): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error('Money must be represented as integer minor units.');
  }
  return Object.freeze({ amountMinor, currency });
}
