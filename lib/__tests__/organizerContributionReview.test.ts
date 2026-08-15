import type { TFunction } from 'i18next';
import { readFileSync } from 'fs';
import path from 'path';

import {
  buildOrganizerReviewRowModel,
  organizerRejectReasonPayload,
  organizerReviewMemberLabel,
  shouldShowOrganizerHandLabel,
} from '../organizerContributionReview';

const t = ((key: string, options?: { number?: number }) => {
  if (key === 'contributions:workspace.handLabel') {
    return `Hand ${options?.number ?? 1}`;
  }
  if (key.endsWith('notReceived')) return 'Payment not received';
  if (key.endsWith('wrongAmount')) return 'Wrong amount';
  if (key.endsWith('cantVerify')) return "Can't verify";
  if (key.endsWith('other')) return 'Other';
  return key;
}) as TFunction;

const workspaceSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
  'utf8',
);

describe('shouldShowOrganizerHandLabel', () => {
  test('is false when each person has one hand', () => {
    expect(
      shouldShowOrganizerHandLabel([
        { id: 'm1', userId: 'u1' },
        { id: 'm2', userId: 'u2' },
      ]),
    ).toBe(false);
  });

  test('is true when one person has two hands', () => {
    expect(
      shouldShowOrganizerHandLabel([
        { id: 'm1', userId: 'u-malcolm' },
        { id: 'm2', userId: 'u-malcolm' },
        { id: 'm3', userId: 'u-other' },
      ]),
    ).toBe(true);
  });
});

describe('organizerReviewMemberLabel', () => {
  test('uses displayLabel when it already identifies the hand', () => {
    expect(
      organizerReviewMemberLabel(
        {
          displayLabel: 'Malcolm · Hand 2',
          full_name: 'Malcolm',
          handNumber: 2,
        },
        { showHandLabel: true, handLabel: 'Hand 2' },
      ),
    ).toBe('Malcolm · Hand 2');
  });

  test('composes name and hand when two hands belong to the same person', () => {
    expect(
      organizerReviewMemberLabel(
        { full_name: 'Malcolm', handNumber: 2 },
        { showHandLabel: true, handLabel: 'Hand 2' },
      ),
    ).toBe('Malcolm · Hand 2');
  });
});

describe('buildOrganizerReviewRowModel', () => {
  test('shows Reported, submittedAt, claimed method, and claimed destination', () => {
    const row = buildOrganizerReviewRowModel({
      member: {
        id: 'hand-2',
        userId: 'u-malcolm',
        full_name: 'Malcolm',
        handNumber: 2,
      },
      contribution: {
        memberId: 'hand-2',
        round: 6,
        status: 'submitted',
        submittedAt: '2026-08-15T12:42:00.000Z',
        note: 'organizer@email.com',
        paymentMethod: 'zelle',
      },
      statusRaw: 'submitted',
      amount: 1000,
      showHandLabel: true,
      t,
    });
    expect(row.displayName).toBe('Malcolm · Hand 2');
    expect(row.statusLabel).toBe('contributions:manualPresentation.organizerReported');
    expect(row.statusLabel.toLowerCase()).not.toContain('pending organizer');
    expect(row.awaitingOrganizer).toBe(true);
    expect(row.submittedAt).toBe('2026-08-15T12:42:00.000Z');
    expect(row.paymentMethod).toBe('zelle');
    expect(row.claimedDestination).toBe('organizer@email.com');
    expect(row.note).toBeNull();
    expect(row.amount).toBe(1000);
  });

  test('hides empty method and note', () => {
    const row = buildOrganizerReviewRowModel({
      member: { id: 'm1', full_name: 'Ada' },
      contribution: {
        memberId: 'm1',
        round: 1,
        status: 'due',
        paymentMethod: '  ',
        note: '',
      },
      statusRaw: 'due',
      amount: 1000,
      showHandLabel: false,
      t,
    });
    expect(row.paymentMethod).toBeNull();
    expect(row.claimedDestination).toBeNull();
    expect(row.note).toBeNull();
  });

  test('does not invent a destination when only a method is stored', () => {
    const row = buildOrganizerReviewRowModel({
      member: { id: 'm1', full_name: 'Ada' },
      contribution: {
        memberId: 'm1',
        round: 1,
        status: 'submitted',
        paymentMethod: 'cash',
      },
      statusRaw: 'submitted',
      amount: 1000,
      showHandLabel: false,
      t,
    });
    expect(row.paymentMethod).toBe('cash');
    expect(row.claimedDestination).toBeNull();
  });
});

describe('organizerRejectReasonPayload', () => {
  test('sends preset reason text on the existing reject body', () => {
    expect(organizerRejectReasonPayload('not_received', t)).toEqual({
      reason: 'Payment not received',
      reasonCode: 'not_received',
    });
    expect(organizerRejectReasonPayload('other', t, '  left in cash  ')).toEqual({
      reason: 'left in cash',
      reasonCode: 'other',
    });
    expect(organizerRejectReasonPayload('other', t, '   ')).toEqual({
      reason: 'Other',
      reasonCode: 'other',
    });
  });
});

describe('workspace organizer review wiring', () => {
  test('dashboard still counts only submitted and late for verify', () => {
    const dashboardSource = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'dashboard.tsx'),
      'utf8',
    );
    expect(dashboardSource).toContain(
      "const REVIEW_STATUSES = new Set(['submitted', 'late'])",
    );
    expect(dashboardSource).toContain("t('paymentsToReview')");
  });

  test('uses Confirm received / Did not receive and still calls existing APIs', () => {
    expect(workspaceSource).toContain("contributionCopy(t, 'workspace.review.confirmAction')");
    expect(workspaceSource).toContain("contributionCopy(t, 'workspace.review.didntReceiveAction')");
    expect(workspaceSource).toContain('approveContribution(token, circle.id, member.id)');
    expect(workspaceSource).toContain(
      'rejectContribution(token, circle.id, member.id, {',
    );
    expect(workspaceSource).toContain('reasonCode');
    expect(workspaceSource).toContain('buildOrganizerReviewRowModel');
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.review.claimedDestination'",
    );
    expect(workspaceSource).not.toContain("t('contributions:workspace.confirm')");
    expect(workspaceSource).not.toContain("t('contributions:workspace.reject')");
  });
});
