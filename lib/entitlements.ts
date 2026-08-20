/**
 * Backend-authoritative Premium entitlements.
 *
 * Never derive Premium access from users.role. Fail closed to free when the
 * entitlements fetch fails or the user is unauthenticated.
 */

export type EntitlementPlan = 'free' | 'premium';

export type SubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type EntitlementSource =
  | 'none'
  | 'stripe'
  | 'apple'
  | 'google'
  | 'admin';

export type EntitlementCapabilities = {
  multiCircle: boolean;
  maxParticipatingHands: number;
  /** null = unlimited open circles (Premium). */
  maxOpenCircles: number | null;
  aiAssistant: boolean;
  aiIntroAvailable: boolean;
  draftPayoutPdf: boolean;
  finalPayoutPdf: boolean;
  advancedReports: boolean;
  premiumReminders: boolean;
  fullActivityHistory: boolean;
  contributionPaymentsEnabled: boolean;
};

export type Entitlements = {
  plan: EntitlementPlan;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  source: EntitlementSource;
  capabilities: EntitlementCapabilities;
};

export const FREE_MAX_PARTICIPATING_HANDS = 20;
export const PREMIUM_MAX_PARTICIPATING_HANDS = 50;
export const FREE_MAX_OPEN_CIRCLES = 1;

/** Fail-closed free payload when entitlements cannot be loaded. */
export function freeEntitlements(): Entitlements {
  return {
    plan: 'free',
    subscriptionStatus: 'inactive',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    source: 'none',
    capabilities: {
      multiCircle: false,
      maxParticipatingHands: FREE_MAX_PARTICIPATING_HANDS,
      maxOpenCircles: FREE_MAX_OPEN_CIRCLES,
      aiAssistant: false,
      aiIntroAvailable: true,
      draftPayoutPdf: false,
      finalPayoutPdf: false,
      advancedReports: false,
      premiumReminders: false,
      fullActivityHistory: false,
      contributionPaymentsEnabled: false,
    },
  };
}

export function isPremiumPlan(entitlements: Entitlements | null | undefined): boolean {
  return entitlements?.plan === 'premium';
}

export function hasCapability(
  entitlements: Entitlements | null | undefined,
  capability: keyof EntitlementCapabilities,
): boolean {
  const caps = entitlements?.capabilities;
  if (!caps) {
    return false;
  }
  const value = caps[capability];
  if (typeof value === 'boolean') {
    return value;
  }
  return false;
}

function asPlan(value: unknown): EntitlementPlan {
  return String(value || '').trim().toLowerCase() === 'premium' ? 'premium' : 'free';
}

function asStatus(value: unknown): SubscriptionStatus {
  const raw = String(value || '').trim().toLowerCase();
  const allowed: SubscriptionStatus[] = [
    'inactive',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired',
  ];
  return (allowed.includes(raw as SubscriptionStatus)
    ? raw
    : 'inactive') as SubscriptionStatus;
}

function asSource(value: unknown): EntitlementSource {
  const raw = String(value || '').trim().toLowerCase();
  const allowed: EntitlementSource[] = [
    'none',
    'stripe',
    'apple',
    'google',
    'admin',
  ];
  return (allowed.includes(raw as EntitlementSource)
    ? raw
    : 'none') as EntitlementSource;
}

/**
 * Normalize a backend entitlements payload. Unknown / partial responses fall
 * back to free (fail closed) rather than inventing Premium.
 */
export function normalizeEntitlements(raw: unknown): Entitlements {
  if (!raw || typeof raw !== 'object') {
    return freeEntitlements();
  }
  const body = raw as Record<string, unknown>;
  const plan = asPlan(body.plan);
  const free = freeEntitlements();
  const capsRaw =
    body.capabilities && typeof body.capabilities === 'object'
      ? (body.capabilities as Record<string, unknown>)
      : {};

  if (plan !== 'premium') {
    return {
      ...free,
      plan: 'free',
      subscriptionStatus: asStatus(body.subscriptionStatus),
      currentPeriodEnd:
        body.currentPeriodEnd == null ? null : String(body.currentPeriodEnd),
      cancelAtPeriodEnd: body.cancelAtPeriodEnd === true,
      trialEndsAt: body.trialEndsAt == null ? null : String(body.trialEndsAt),
      source: asSource(body.source),
      capabilities: {
        ...free.capabilities,
        // Free always keeps intro available unless backend says otherwise.
        aiIntroAvailable: capsRaw.aiIntroAvailable !== false,
        contributionPaymentsEnabled:
          capsRaw.contributionPaymentsEnabled === true,
      },
    };
  }

  const maxHands = Number(capsRaw.maxParticipatingHands);
  const maxOpenRaw = capsRaw.maxOpenCircles;
  const maxOpenCircles =
    maxOpenRaw === null || maxOpenRaw === undefined
      ? null
      : Number.isFinite(Number(maxOpenRaw))
        ? Number(maxOpenRaw)
        : null;

  return {
    plan: 'premium',
    subscriptionStatus: asStatus(body.subscriptionStatus),
    currentPeriodEnd:
      body.currentPeriodEnd == null ? null : String(body.currentPeriodEnd),
    cancelAtPeriodEnd: body.cancelAtPeriodEnd === true,
    trialEndsAt: body.trialEndsAt == null ? null : String(body.trialEndsAt),
    source: asSource(body.source),
    capabilities: {
      multiCircle: capsRaw.multiCircle === true,
      maxParticipatingHands: Number.isFinite(maxHands)
        ? maxHands
        : PREMIUM_MAX_PARTICIPATING_HANDS,
      maxOpenCircles,
      aiAssistant: capsRaw.aiAssistant === true,
      aiIntroAvailable: capsRaw.aiIntroAvailable === true,
      draftPayoutPdf: capsRaw.draftPayoutPdf === true,
      finalPayoutPdf: capsRaw.finalPayoutPdf === true,
      advancedReports: capsRaw.advancedReports === true,
      premiumReminders: capsRaw.premiumReminders === true,
      fullActivityHistory: capsRaw.fullActivityHistory === true,
      contributionPaymentsEnabled:
        capsRaw.contributionPaymentsEnabled === true,
    },
  };
}

/** Plan tier string for capacity helpers that still accept free|premium. */
export function planTierFromEntitlements(
  entitlements: Entitlements | null | undefined,
): 'free' | 'premium' {
  return isPremiumPlan(entitlements) ? 'premium' : 'free';
}
