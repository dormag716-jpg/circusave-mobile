/**
 * Backend-authoritative Premium entitlements.
 *
 * Never derive Premium access from users.role. Fail closed to free when the
 * entitlements fetch fails or the user is unauthenticated.
 */

export type EntitlementPlan = 'free' | 'premium';

/** Plan tier from the backend. `plan` stays `free | premium` for older builds. */
export type PlanTier = 'free' | 'member_pro' | 'organizer_pro';

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
  | 'google_play'
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
  /** Members per circle, set by the organizer's plan. Not enforced by the app. */
  maxMembersPerCircle: number;
  /** Hands this person gets without paying, per circle. */
  handsIncluded: number;
  /** Most hands this person can hold in one circle, including purchased ones. */
  maxHandsPerPerson: number;
};

export type Entitlements = {
  plan: EntitlementPlan;
  tier: PlanTier;
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
    tier: 'free',
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
      aiIntroAvailable: false,
      draftPayoutPdf: false,
      finalPayoutPdf: false,
      advancedReports: false,
      premiumReminders: false,
      fullActivityHistory: false,
      contributionPaymentsEnabled: false,
      maxMembersPerCircle: 20,
      handsIncluded: 1,
      maxHandsPerPerson: 3,
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

const TIER_DEFAULTS: Record<
  PlanTier,
  { maxMembersPerCircle: number; handsIncluded: number; maxHandsPerPerson: number }
> = {
  free: { maxMembersPerCircle: 20, handsIncluded: 1, maxHandsPerPerson: 3 },
  member_pro: { maxMembersPerCircle: 20, handsIncluded: 3, maxHandsPerPerson: 6 },
  organizer_pro: { maxMembersPerCircle: 50, handsIncluded: 3, maxHandsPerPerson: 6 },
};

/** A paid plan without a readable tier is the one plan sold today: Organizer Pro. */
function asTier(value: unknown, plan: EntitlementPlan): PlanTier {
  if (plan !== 'premium') {
    return 'free';
  }
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'member_pro' ? 'member_pro' : 'organizer_pro';
}

function readCount(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function tierLimits(
  tier: PlanTier,
  caps: Record<string, unknown>,
): Pick<
  EntitlementCapabilities,
  'maxMembersPerCircle' | 'handsIncluded' | 'maxHandsPerPerson'
> {
  const base = TIER_DEFAULTS[tier];
  return {
    maxMembersPerCircle: readCount(caps.maxMembersPerCircle, base.maxMembersPerCircle),
    handsIncluded: readCount(caps.handsIncluded, base.handsIncluded),
    maxHandsPerPerson: readCount(caps.maxHandsPerPerson, base.maxHandsPerPerson),
  };
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
    'google_play',
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
      tier: 'free',
      subscriptionStatus: asStatus(body.subscriptionStatus),
      currentPeriodEnd:
        body.currentPeriodEnd == null ? null : String(body.currentPeriodEnd),
      cancelAtPeriodEnd: body.cancelAtPeriodEnd === true,
      trialEndsAt: body.trialEndsAt == null ? null : String(body.trialEndsAt),
      source: asSource(body.source),
      capabilities: {
        ...free.capabilities,
        aiIntroAvailable: capsRaw.aiIntroAvailable === true,
        contributionPaymentsEnabled:
          capsRaw.contributionPaymentsEnabled === true,
        ...tierLimits('free', capsRaw),
      },
    };
  }

  const tier = asTier(body.tier, plan);

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
    tier,
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
      ...tierLimits(tier, capsRaw),
    },
  };
}

/** Plan tier string for capacity helpers that still accept free|premium. */
export function planTierFromEntitlements(
  entitlements: Entitlements | null | undefined,
): 'free' | 'premium' {
  return isPremiumPlan(entitlements) ? 'premium' : 'free';
}
