import { normalizeEntitlements, type Entitlements } from '../billing/entitlements';
import type { ExtraHandQuote, ExtraHandVerifyResult } from '../billing/extraHandPurchase';
import { ApiError } from '../platform/networkErrors';
import { isRecord, readString, requestJson } from './http';

export type BillingPlan = {
  id: 'free' | 'premium';
  name: string;
  tagline: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  annualSavingsCents?: number;
  trialDays: number;
  features: string[];
};

export type BillingPlansResponse = {
  currency: string;
  recommendedPlan: 'premium';
  plans: BillingPlan[];
};

export type GooglePlayPlanConfig = {
  productId: string;
  basePlanId: string;
  offerId: string | null;
};

export type GooglePlayBillingStatus =
  | {
      provider: 'google_play';
      enabled: false;
    }
  | {
      provider: 'google_play';
      enabled: true;
      packageName: string;
      obfuscatedAccountId: string;
      monthly: GooglePlayPlanConfig;
      annual: GooglePlayPlanConfig;
      trialEligible: boolean;
      /** Per-plan products. Absent until the backend has the plan tiers set up. */
      tiers?: GooglePlayTierPlans;
    };

export type GooglePlayTierPlans = Partial<
  Record<
    'member_pro' | 'organizer_pro',
    { monthly?: GooglePlayPlanConfig; annual?: GooglePlayPlanConfig }
  >
>;

export type GooglePlayVerificationResponse = {
  provider: 'google_play';
  restored: boolean;
  status: string;
  productId: string;
  basePlanId: string;
  offerId: string | null;
  currentPeriodEnd: string | null;
  acknowledgementState: string;
  entitlements: Entitlements;
};

function invalidGooglePlayResponse(message: string): never {
  throw new ApiError(message, 500);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function normalizeGooglePlayPlanConfig(
  value: unknown,
): GooglePlayPlanConfig {
  if (
    !isRecord(value) ||
    !readString(value.productId) ||
    !readString(value.basePlanId) ||
    !isNullableString(value.offerId)
  ) {
    return invalidGooglePlayResponse(
      'Google Play billing status response was invalid.',
    );
  }
  return {
    productId: readString(value.productId),
    basePlanId: readString(value.basePlanId),
    offerId: value.offerId,
  };
}

/**
 * Lenient on purpose: an old backend sends no `tiers`, and one broken entry
 * must not take down the whole status (and with it the old monthly/annual plans).
 */
export function normalizeGooglePlayTierPlans(value: unknown): GooglePlayTierPlans {
  const result: GooglePlayTierPlans = {};
  if (!isRecord(value)) {
    return result;
  }
  for (const tier of ['member_pro', 'organizer_pro'] as const) {
    const entry = value[tier];
    if (!isRecord(entry)) {
      continue;
    }
    const plans: { monthly?: GooglePlayPlanConfig; annual?: GooglePlayPlanConfig } = {};
    for (const interval of ['monthly', 'annual'] as const) {
      try {
        plans[interval] = normalizeGooglePlayPlanConfig(entry[interval]);
      } catch {
        // skip an entry that is missing or malformed
      }
    }
    if (plans.monthly || plans.annual) {
      result[tier] = plans;
    }
  }
  return result;
}

function normalizeGooglePlayBillingStatus(
  value: unknown,
): GooglePlayBillingStatus {
  if (
    !isRecord(value) ||
    value.provider !== 'google_play' ||
    typeof value.enabled !== 'boolean'
  ) {
    return invalidGooglePlayResponse(
      'Google Play billing status response was invalid.',
    );
  }
  if (value.enabled === false) {
    return { provider: 'google_play', enabled: false };
  }
  if (
    !readString(value.packageName) ||
    !readString(value.obfuscatedAccountId) ||
    typeof value.trialEligible !== 'boolean'
  ) {
    return invalidGooglePlayResponse(
      'Google Play billing status response was invalid.',
    );
  }
  const tiers = normalizeGooglePlayTierPlans(value.tiers);
  return {
    provider: 'google_play',
    enabled: true,
    packageName: readString(value.packageName),
    obfuscatedAccountId: readString(value.obfuscatedAccountId),
    monthly: normalizeGooglePlayPlanConfig(value.monthly),
    annual: normalizeGooglePlayPlanConfig(value.annual),
    trialEligible: value.trialEligible,
    ...(Object.keys(tiers).length > 0 ? { tiers } : {}),
  };
}

function normalizeGooglePlayVerificationResponse(
  value: unknown,
): GooglePlayVerificationResponse {
  if (
    !isRecord(value) ||
    value.provider !== 'google_play' ||
    typeof value.restored !== 'boolean' ||
    !readString(value.status) ||
    !readString(value.productId) ||
    !readString(value.basePlanId) ||
    !isNullableString(value.offerId) ||
    !isNullableString(value.currentPeriodEnd) ||
    !readString(value.acknowledgementState) ||
    !isRecord(value.entitlements)
  ) {
    return invalidGooglePlayResponse(
      'Google Play verification response was invalid.',
    );
  }
  return {
    provider: 'google_play',
    restored: value.restored,
    status: readString(value.status),
    productId: readString(value.productId),
    basePlanId: readString(value.basePlanId),
    offerId: value.offerId,
    currentPeriodEnd: value.currentPeriodEnd,
    acknowledgementState: readString(value.acknowledgementState),
    entitlements: normalizeEntitlements(value.entitlements),
  };
}

function sanitizeGooglePlayFailure(error: unknown): never {
  if (error instanceof ApiError) {
    throw new ApiError(
      'Google Play billing request failed.',
      error.status,
      undefined,
      {
        category: error.category,
        retryAfterSeconds: error.retryAfterSeconds,
      },
    );
  }
  throw new ApiError('Google Play billing request failed.', 0);
}

export type AppleTierPlans = Partial<
  Record<
    'member_pro' | 'organizer_pro',
    { monthly?: { productId: string }; annual?: { productId: string } }
  >
>;

export type AppleBillingStatus =
  | { provider: 'apple_app_store'; enabled: false }
  | {
      provider: 'apple_app_store';
      enabled: true;
      bundleId: string;
      environment: 'sandbox' | 'production';
      /** Sent with every purchase so the backend can tie it to this account. */
      appAccountToken: string;
      tiers: AppleTierPlans;
    };

export type AppleVerificationResponse = {
  provider: 'apple_app_store';
  restored: boolean;
  status: string;
  productId: string;
  tier: 'member_pro' | 'organizer_pro' | null;
  billingPeriod: 'monthly' | 'annual' | null;
  currentPeriodEnd: string | null;
  entitlements: Entitlements;
};

function invalidApple(): never {
  throw new ApiError('Apple billing response was invalid.', 500);
}

export function normalizeAppleBillingStatus(value: unknown): AppleBillingStatus {
  if (
    !isRecord(value) ||
    value.provider !== 'apple_app_store' ||
    typeof value.enabled !== 'boolean'
  ) {
    return invalidApple();
  }
  if (!value.enabled) {
    return { provider: 'apple_app_store', enabled: false };
  }
  if (
    !readString(value.bundleId) ||
    !readString(value.appAccountToken) ||
    (value.environment !== 'sandbox' && value.environment !== 'production')
  ) {
    return invalidApple();
  }
  const tiers: AppleTierPlans = {};
  if (isRecord(value.tiers)) {
    for (const tier of ['member_pro', 'organizer_pro'] as const) {
      const entry = value.tiers[tier];
      if (!isRecord(entry)) continue;
      const plans: { monthly?: { productId: string }; annual?: { productId: string } } = {};
      for (const interval of ['monthly', 'annual'] as const) {
        const plan = entry[interval];
        if (isRecord(plan) && readString(plan.productId)) {
          plans[interval] = { productId: readString(plan.productId) };
        }
      }
      if (plans.monthly || plans.annual) tiers[tier] = plans;
    }
  }
  return {
    provider: 'apple_app_store',
    enabled: true,
    bundleId: readString(value.bundleId),
    environment: value.environment,
    appAccountToken: readString(value.appAccountToken),
    tiers,
  };
}

export function normalizeAppleVerificationResponse(
  value: unknown,
): AppleVerificationResponse {
  if (
    !isRecord(value) ||
    value.provider !== 'apple_app_store' ||
    typeof value.restored !== 'boolean' ||
    !readString(value.status) ||
    !readString(value.productId) ||
    !isNullableString(value.currentPeriodEnd) ||
    !isRecord(value.entitlements)
  ) {
    return invalidApple();
  }
  const tier =
    value.tier === 'member_pro' || value.tier === 'organizer_pro' ? value.tier : null;
  const billingPeriod =
    value.billingPeriod === 'monthly' || value.billingPeriod === 'annual'
      ? value.billingPeriod
      : null;
  return {
    provider: 'apple_app_store',
    restored: value.restored,
    status: readString(value.status),
    productId: readString(value.productId),
    tier,
    billingPeriod,
    currentPeriodEnd: value.currentPeriodEnd,
    entitlements: normalizeEntitlements(value.entitlements),
  };
}

function sanitizeAppleFailure(error: unknown): never {
  if (error instanceof ApiError) {
    throw new ApiError('Apple billing request failed.', error.status, undefined, {
      category: error.category,
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  throw new ApiError('Apple billing request failed.', 0);
}

export async function getAppleBillingStatus(
  token: string,
): Promise<AppleBillingStatus> {
  try {
    const payload = await requestJson<unknown>('/billing/apple/status', {
      token,
      revalidate: true,
    });
    return normalizeAppleBillingStatus(payload);
  } catch (error) {
    return sanitizeAppleFailure(error);
  }
}

async function postAppleTransaction(
  path: '/billing/apple/verify' | '/billing/apple/restore',
  token: string,
  signedTransaction: string,
): Promise<AppleVerificationResponse> {
  try {
    const payload = await requestJson<unknown>(path, {
      method: 'POST',
      token,
      body: JSON.stringify({ signedTransaction }),
    });
    return normalizeAppleVerificationResponse(payload);
  } catch (error) {
    return sanitizeAppleFailure(error);
  }
}

export function verifyApplePurchase(
  token: string,
  signedTransaction: string,
): Promise<AppleVerificationResponse> {
  return postAppleTransaction('/billing/apple/verify', token, signedTransaction);
}

export function restoreApplePurchase(
  token: string,
  signedTransaction: string,
): Promise<AppleVerificationResponse> {
  return postAppleTransaction('/billing/apple/restore', token, signedTransaction);
}

export type ReminderSchedule = {
  circleId: string;
  enabled: boolean;
  repeatHours: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: {
    status?: string;
    remindedCount?: number;
    error?: string;
  } | null;
};

export function getBillingPlans(): Promise<BillingPlansResponse> {
  return requestJson<BillingPlansResponse>('/billing/plans');
}

export async function getGooglePlayBillingStatus(
  token: string,
): Promise<GooglePlayBillingStatus> {
  try {
    const payload = await requestJson<unknown>(
      '/billing/google-play/status',
      {
        token,
        revalidate: true,
      },
    );
    return normalizeGooglePlayBillingStatus(payload);
  } catch (error) {
    return sanitizeGooglePlayFailure(error);
  }
}

export async function verifyGooglePlayPurchase(
  token: string,
  purchaseToken: string,
): Promise<GooglePlayVerificationResponse> {
  try {
    const payload = await requestJson<unknown>(
      '/billing/google-play/verify',
      {
        method: 'POST',
        token,
        body: JSON.stringify({ purchaseToken }),
      },
    );
    return normalizeGooglePlayVerificationResponse(payload);
  } catch (error) {
    return sanitizeGooglePlayFailure(error);
  }
}

export async function restoreGooglePlayPurchase(
  token: string,
  purchaseToken: string,
): Promise<GooglePlayVerificationResponse> {
  try {
    const payload = await requestJson<unknown>(
      '/billing/google-play/restore',
      {
        method: 'POST',
        token,
        body: JSON.stringify({ purchaseToken }),
      },
    );
    return normalizeGooglePlayVerificationResponse(payload);
  } catch (error) {
    return sanitizeGooglePlayFailure(error);
  }
}

function normalizeExtraHandQuote(value: unknown): ExtraHandQuote {
  if (
    !isRecord(value) ||
    !readString(value.reservationId) ||
    !readString(value.circleId) ||
    !readString(value.productId) ||
    !readString(value.obfuscatedAccountId) ||
    !readString(value.obfuscatedProfileId) ||
    typeof value.handNumber !== 'number'
  ) {
    return invalidGooglePlayResponse('Extra hand quote response was invalid.');
  }
  return {
    reservationId: readString(value.reservationId),
    circleId: readString(value.circleId),
    handNumber: value.handNumber,
    productId: readString(value.productId),
    packageName: readString(value.packageName),
    obfuscatedAccountId: readString(value.obfuscatedAccountId),
    obfuscatedProfileId: readString(value.obfuscatedProfileId),
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    handsIncluded: typeof value.handsIncluded === 'number' ? value.handsIncluded : 0,
    maxHandsPerPerson:
      typeof value.maxHandsPerPerson === 'number' ? value.maxHandsPerPerson : 0,
  };
}

function normalizeExtraHandVerifyResult(value: unknown): ExtraHandVerifyResult {
  if (
    !isRecord(value) ||
    !readString(value.reservationId) ||
    !readString(value.status) ||
    typeof value.handNumber !== 'number'
  ) {
    return invalidGooglePlayResponse('Extra hand verification response was invalid.');
  }
  return {
    reservationId: readString(value.reservationId),
    circleId: readString(value.circleId),
    handNumber: value.handNumber,
    status: readString(value.status),
    membershipId: typeof value.membershipId === 'string' ? value.membershipId : null,
    consumed: value.consumed === true,
  };
}

/**
 * Asks the backend whether one extra hand can be bought for this circle.
 * Errors keep the backend's `code` in `payload` so the caller can tell
 * "not offered" from "failed"; nothing is charged by this call.
 */
export async function requestExtraHandQuote(
  token: string,
  circleId: string,
): Promise<ExtraHandQuote> {
  const payload = await requestJson<unknown>(
    `/groups/${encodeURIComponent(circleId)}/extra-hands/quote`,
    { method: 'POST', token, body: JSON.stringify({}) },
  );
  return normalizeExtraHandQuote(payload);
}

/** Tells the backend about a Google Play payment. Only the backend adds the hand. */
export async function verifyExtraHandPurchase(
  token: string,
  input: { purchaseToken: string; reservationId: string },
): Promise<ExtraHandVerifyResult> {
  const payload = await requestJson<unknown>(
    '/billing/google-play/extra-hand/verify',
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        purchaseToken: input.purchaseToken,
        reservationId: input.reservationId,
      }),
    },
  );
  return normalizeExtraHandVerifyResult(payload);
}

export function getPremiumReminderSchedule(
  token: string,
  circleId: string,
): Promise<ReminderSchedule> {
  return requestJson<ReminderSchedule>(
    `/premium/circles/${circleId}/reminder-schedule`,
    { token },
  );
}

export function updatePremiumReminderSchedule(
  token: string,
  circleId: string,
  input: {
    enabled: boolean;
    repeatHours: number;
    nextRunAt?: string;
  },
): Promise<ReminderSchedule> {
  return requestJson<ReminderSchedule>(
    `/premium/circles/${circleId}/reminder-schedule`,
    {
      method: 'PUT',
      token,
      body: JSON.stringify(input),
    },
  );
}
