/**
 * Phase 1 wrap-up: financial invariants first, then UX mappings.
 * Does not change money rules — only proves the contracts still hold.
 */
jest.mock('expo-linking', () => ({
  parse: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { readFileSync } from 'fs';
import path from 'path';
import type { TFunction } from 'i18next';

import { contributionHref } from '../navigation';
import {
  canStartMarkAsSentSubmit,
  isAlreadyReportedSubmissionError,
  resolveMarkAsSentContributionHrefHandId,
  resolveMarkAsSentTarget,
} from '../markContributionSent';
import { buildMemberContributionCardModel } from '../memberContributionCard';
import { presentManualContribution } from '../i18n/financial-presentation';
import contributionsEn from '../i18n/locales/en/contributions.json';
import {
  canShowBackendGatedAction,
  getCircleLifecyclePhase,
  isReadOnlyLifecyclePhase,
} from '../startCircleReadiness';

const t = ((key: string, options?: { number?: number; amount?: string }) => {
  if (key === 'contributions:workspace.handLabel') {
    return `Hand ${options?.number ?? 1}`;
  }
  return key;
}) as TFunction;

const workspaceSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
  'utf8',
);
const contributionSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
  'utf8',
);
const supportSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'support.tsx'),
  'utf8',
);
const dashboardSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', '(tabs)', 'dashboard.tsx'),
  'utf8',
);
const stripeSource = readFileSync(
  path.join(__dirname, '..', 'stripeContributionPayment.ts'),
  'utf8',
);

function card(statusByHandId: Record<string, string>) {
  return buildMemberContributionCardModel({
    hands: Object.keys(statusByHandId).map((id, index) => ({
      id,
      handNumber: index + 1,
      isParticipating: true,
      userId: 'usr_1',
    })),
    statusByHandId,
    contributionAmount: 1000,
    t,
  });
}

describe('Phase 1 financial invariants', () => {
  test('a member cannot promote themselves to approve or release', () => {
    expect(canShowBackendGatedAction(false)).toBe(false);
    expect(canShowBackendGatedAction(undefined, true)).toBe(false);
    expect(
      canShowBackendGatedAction(false, true),
    ).toBe(false);
    expect(workspaceSource).toContain(
      'viewerPermissions?.canApproveContributions',
    );
    expect(workspaceSource).toContain(
      'viewerPermissions?.canReleasePayout',
    );
    expect(workspaceSource).not.toMatch(
      /canReviewContributions\s*=\s*true/,
    );
  });

  test('duplicate mobile submit is blocked and already-reported errors refresh', () => {
    const target = resolveMarkAsSentTarget(card({ hand_a: 'due' }));
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target,
        inflightHandId: 'hand_a',
      }),
    ).toBe(false);
    expect(
      isAlreadyReportedSubmissionError(
        new Error('Only due, missed, or rejected contributions can be submitted.'),
      ),
    ).toBe(true);
    expect(workspaceSource).toContain('isAlreadyReportedSubmissionError');
    expect(workspaceSource).toContain(
      "message.includes('already has confirmed pot funding recorded')",
    );
  });

  test('Mark as sent and Stripe stay on separate rails', () => {
    expect(workspaceSource).not.toMatch(/createPaymentIntent|runStripeContributionPayment/);
    expect(contributionSource).toContain('runStripeContributionPayment');
    expect(contributionSource).toContain('createPaymentIntent');
    expect(stripeSource).toContain('export async function runStripeContributionPayment');
    expect(stripeSource).toContain('class PaymentSessionLock');
  });

  test('paused, closed, and completed remain read-only for financial CTAs', () => {
    for (const status of ['paused', 'closed', 'completed'] as const) {
      expect(isReadOnlyLifecyclePhase(getCircleLifecyclePhase({ status }))).toBe(
        true,
      );
    }
    expect(
      canShowBackendGatedAction(true, false),
    ).toBe(false);
  });

  test('release payout still requires backend grant plus local readiness', () => {
    expect(canShowBackendGatedAction(true, true)).toBe(true);
    expect(canShowBackendGatedAction(true, false)).toBe(false);
    expect(canShowBackendGatedAction(false, true)).toBe(false);
    expect(workspaceSource).toContain('backendPayoutReady && !payoutReleased');
  });
});

describe('Phase 1 UX mappings', () => {
  test('empty instructions stay honest and do not block reporting', () => {
    const model = buildMemberContributionCardModel({
      hands: [{ id: 'm1', handNumber: 1, isParticipating: true, userId: 'usr_1' }],
      statusByHandId: { m1: 'due' },
      contributionAmount: 1000,
      paymentInstructions: null,
      t,
    });
    expect(model.hasInstructions).toBe(false);
    expect(model.anyReportable).toBe(true);
    expect(model.hands[0].presentation.canReportPayment).toBe(true);
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.instructionsMissingTitle')",
    );
  });

  test('confirmation copy is a report, not a CircuSave transfer', () => {
    expect(workspaceSource).toContain(
      "t('contributions:markAsSent.confirmBody'",
    );
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.markAsSentEducation')",
    );
    expect(contributionsEn.markAsSent.confirmBody).toContain(
      'does not transfer money',
    );
    expect(contributionsEn.workspace.markAsSentEducation).toContain(
      'does not move the money',
    );
    expect(contributionsEn.markAsSent.confirmBody.toLowerCase()).not.toContain(
      'circuSave sent',
    );
  });

  test('submitted waits with timestamp; confirmed is not reportable; rejected can resubmit', () => {
    const submitted = card({ hand_a: 'submitted' });
    const confirmed = card({ hand_a: 'confirmed' });
    const rejected = buildMemberContributionCardModel({
      hands: [{ id: 'hand_a', handNumber: 1, isParticipating: true, userId: 'u1' }],
      contributions: [
        {
          memberId: 'hand_a',
          round: 1,
          status: 'rejected',
          note: 'Wrong amount',
        },
      ],
      contributionAmount: 1000,
      t,
    });
    expect(submitted.hands[0].presentation.awaitingOrganizer).toBe(true);
    expect(submitted.hands[0].presentation.isConfirmed).toBe(false);
    expect(confirmed.anyReportable).toBe(false);
    expect(rejected.hands[0].note).toBe('Wrong amount');
    expect(rejected.hands[0].presentation.canReportPayment).toBe(true);
    expect(presentManualContribution('submitted', t).isConfirmed).toBe(false);
  });

  test('two reportable hands stay separate and never workspace-submit', () => {
    const model = card({ hand_1: 'due', hand_2: 'due' });
    expect(model.hands[0].handId).not.toBe(model.hands[1].handId);
    expect(model.totalDue).toBe(2000);
    expect(resolveMarkAsSentTarget(model)).toBeNull();
    expect(resolveMarkAsSentTarget(model, 'hand_1')).toBeNull();
    expect(resolveMarkAsSentContributionHrefHandId(model, 'hand_1')).toBe(
      'hand_1',
    );
    expect(resolveMarkAsSentContributionHrefHandId(model, 'hand_1')).not.toBe(
      'hand_2',
    );
    expect(contributionHref('circle-1', 'hand_2')).toEqual({
      pathname: '/payment/contribution',
      params: { circleId: 'circle-1', handId: 'hand_2' },
    });
  });

  test('dashboard verify count stays submitted and late only', () => {
    expect(dashboardSource).toContain(
      "const REVIEW_STATUSES = new Set(['submitted', 'late'])",
    );
  });

  test('support and workspace no longer teach I sent it', () => {
    expect(supportSource).not.toContain('I Sent It');
    expect(workspaceSource).not.toContain('I sent it ✓');
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.review.confirmAction')",
    );
  });
});
