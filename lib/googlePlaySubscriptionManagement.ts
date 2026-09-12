import Constants from 'expo-constants';
import { Linking } from 'react-native';

const GOOGLE_PLAY_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions';
const PACKAGE_NAME_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class GooglePlaySubscriptionManagementError extends Error {
  readonly code = 'google_play_subscription_management_unavailable';

  constructor() {
    super('Google Play subscription management is unavailable.');
    this.name = 'GooglePlaySubscriptionManagementError';
  }
}

export function getAndroidApplicationPackage(): string | null {
  const packageName = Constants.expoConfig?.android?.package;
  return typeof packageName === 'string' &&
    PACKAGE_NAME_PATTERN.test(packageName)
    ? packageName
    : null;
}

export function buildGooglePlaySubscriptionManagementUrl(
  packageName: string,
  productId?: string | null,
): string {
  if (!PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new GooglePlaySubscriptionManagementError();
  }
  if (productId != null && !PRODUCT_ID_PATTERN.test(productId)) {
    throw new GooglePlaySubscriptionManagementError();
  }

  const url = new URL(GOOGLE_PLAY_SUBSCRIPTIONS_URL);
  url.searchParams.set('package', packageName);
  if (productId) {
    url.searchParams.set('sku', productId);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'play.google.com' ||
    url.pathname !== '/store/account/subscriptions'
  ) {
    throw new GooglePlaySubscriptionManagementError();
  }
  return url.toString();
}

export async function openGooglePlaySubscriptionManagement(
  packageName: string,
  productId?: string | null,
): Promise<void> {
  const url = buildGooglePlaySubscriptionManagementUrl(packageName, productId);
  try {
    if (!(await Linking.canOpenURL(url))) {
      throw new GooglePlaySubscriptionManagementError();
    }
    await Linking.openURL(url);
  } catch {
    throw new GooglePlaySubscriptionManagementError();
  }
}
