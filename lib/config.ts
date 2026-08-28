export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

export const APP_SCHEME = 'circusavemobile';
export const STRIPE_RETURN_URL = `${APP_SCHEME}://stripe-redirect`;
export const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.circusave.mobile';

export function isProductionAppEnv(appEnv: string | null | undefined = APP_ENV): boolean {
  return String(appEnv || '').trim().toLowerCase() === 'production';
}

export function isTestStripePublishableKey(key: string | null | undefined): boolean {
  return /^pk_test_/i.test(String(key || '').trim());
}

export function isLiveStripePublishableKey(key: string | null | undefined): boolean {
  return /^pk_live_/i.test(String(key || '').trim());
}

/**
 * Production must not initialize Stripe with a test publishable key.
 * Returns an empty string so StripeProvider is skipped instead of crashing launch.
 */
export function resolveStripePublishableKey(
  key: string | null | undefined = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  appEnv: string | null | undefined = APP_ENV,
): string {
  const value = String(key || '').trim();
  if (!value) return '';
  if (isProductionAppEnv(appEnv) && isTestStripePublishableKey(value)) {
    return '';
  }
  return value;
}
