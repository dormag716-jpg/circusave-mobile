import { normalizeEntitlements, type Entitlements } from '../billing/entitlements';
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
    };

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
  return {
    provider: 'google_play',
    enabled: true,
    packageName: readString(value.packageName),
    obfuscatedAccountId: readString(value.obfuscatedAccountId),
    monthly: normalizeGooglePlayPlanConfig(value.monthly),
    annual: normalizeGooglePlayPlanConfig(value.annual),
    trialEligible: value.trialEligible,
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
