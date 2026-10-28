import type { TFunction } from 'i18next';

import { buildRecordsListQuery, pdfFilenameForReference } from '@/lib/api';

import { externalContributionProvenanceText } from '../provenanceText';
import {
  CONTRIBUTION_STATUS_FILTERS,
  PAYOUT_STATUS_FILTERS,
  RECORDS_SEGMENTS,
  actorKey,
  appendRecords,
  contributionNeedsReview,
  contributionTone,
  documentTypeKey,
  payoutTone,
  roundTone,
  contributionStatusKey,
  formatCents,
  groupByRound,
  historyEventKey,
  payoutDisplayStatus,
  positionLabel,
  roundDisplayStatus,
  verificationKey,
} from '../recordsPresentation';

const positionText = (n: number) => `Pos ${n}`;

describe('Records navigation', () => {
  it('is exactly Overview, Contributions, Payouts, Rounds, Documents', () => {
    expect(RECORDS_SEGMENTS).toEqual([
      'overview',
      'contributions',
      'payouts',
      'rounds',
      'documents',
    ]);
  });
});

describe('status vocabulary', () => {
  it('shows a pending payout as scheduled and never invents a ready state', () => {
    expect(payoutDisplayStatus('pending')).toBe('scheduled');
    expect(payoutDisplayStatus('released')).toBe('released');
    expect(payoutDisplayStatus('ready')).toBe('unknown');
    expect(payoutDisplayStatus(undefined)).toBe('unknown');
    expect([...PAYOUT_STATUS_FILTERS]).toEqual(['pending', 'released']);
  });

  it('maps contribution statuses and flags the ones waiting for review', () => {
    expect([...CONTRIBUTION_STATUS_FILTERS]).toEqual([
      'due',
      'submitted',
      'confirmed',
      'rejected',
      'late',
      'missed',
    ]);
    expect(contributionStatusKey('CONFIRMED')).toBe('confirmed');
    expect(contributionStatusKey('weird')).toBe('unknown');
    expect(contributionNeedsReview('submitted')).toBe(true);
    expect(contributionNeedsReview('late')).toBe(true);
    expect(contributionNeedsReview('confirmed')).toBe(false);
    expect(contributionNeedsReview('due')).toBe(false);
  });

  it('maps round and verification states with a safe default', () => {
    expect(roundDisplayStatus('open')).toBe('open');
    expect(roundDisplayStatus('closed')).toBe('closed');
    expect(roundDisplayStatus('pending')).toBe('upcoming');
    expect(roundDisplayStatus('x')).toBe('unknown');
    expect(verificationKey({ status: 'verified' })).toBe('verified');
    expect(verificationKey({ status: 'reopened' })).toBe('reopened');
    expect(verificationKey({ status: 'nonsense' })).toBe('unverified');
    expect(verificationKey(null)).toBe('unverified');
  });
});

describe('who a record is about', () => {
  it('re-localizes the generic backend position so no other name appears', () => {
    expect(
      positionLabel({ number: 2, label: 'Position 2' }, positionText, 'Member'),
    ).toBe('Pos 2');
    expect(
      positionLabel({ number: 3, label: 'position 3' }, positionText, 'Member'),
    ).toBe('Pos 3');
  });

  it('keeps a name only when the backend sent one', () => {
    expect(
      positionLabel({ number: 1, label: 'Olive Organizer' }, positionText, 'Member'),
    ).toBe('Olive Organizer');
  });

  it('falls back to a neutral label when there is no usable position', () => {
    expect(positionLabel(null, positionText, 'Member')).toBe('Member');
    expect(positionLabel({ number: 0, label: '' }, positionText, 'Member')).toBe(
      'Member',
    );
  });
});

describe('history presentation', () => {
  it('maps known events and never shows a raw identifier', () => {
    expect(historyEventKey('submitted')).toBe('submitted');
    expect(historyEventKey('contribution_confirmed')).toBe('confirmed');
    expect(historyEventKey('payout_completed')).toBe('payoutReleased');
    expect(historyEventKey('round_started')).toBe('roundStarted');
    expect(historyEventKey('cycle_completed')).toBe('cycleCompleted');
    expect(historyEventKey('some_new_backend_event')).toBe('recorded');
    expect(historyEventKey(undefined)).toBe('recorded');
  });

  it('reads actors by role', () => {
    expect(actorKey({ role: 'organizer' })).toBe('organizer');
    expect(actorKey({ role: 'member' })).toBe('member');
    expect(actorKey({ role: 'system' })).toBe('system');
    expect(actorKey(null)).toBe('system');
  });

  it('formats cents and leaves an absent amount empty', () => {
    expect(formatCents(5000, 'en')).toBe('$50.00');
    expect(formatCents(0, 'en')).toBe('$0.00');
    expect(formatCents(null, 'en')).toBe('');
    expect(formatCents(undefined, 'en')).toBe('');
  });
});

describe('lists', () => {
  it('groups newest round first and keeps backend order inside a round', () => {
    const rows = [
      { reference: 'a', round: { number: 1 } },
      { reference: 'b', round: { number: 1 } },
      { reference: 'c', round: { number: 3 } },
      { reference: 'd', round: { number: 2 } },
    ];
    expect(groupByRound(rows).map((g) => [g.round, g.rows.map((r) => r.reference)])).toEqual([
      [3, ['c']],
      [2, ['d']],
      [1, ['a', 'b']],
    ]);
  });

  it('appends the next page without duplicating a row', () => {
    const merged = appendRecords(
      [{ reference: 'a' }, { reference: 'b' }],
      [{ reference: 'b' }, { reference: 'c' }],
    );
    expect(merged.map((r) => r.reference)).toEqual(['a', 'b', 'c']);
  });

  it('builds the list query the backend expects', () => {
    expect(buildRecordsListQuery()).toBe('');
    expect(buildRecordsListQuery({ status: 'submitted', limit: 50, offset: 50 })).toBe(
      '?status=submitted&limit=50&offset=50',
    );
    expect(buildRecordsListQuery({ round: 2, member: 'm_1' })).toBe(
      '?round=2&member=m_1',
    );
  });
});

describe('legacy statement confirmations', () => {
  // Stub t: returns "key|params" so the test can see which sentence was chosen.
  const t = ((key: string, params?: Record<string, unknown>) =>
    params ? `${key}|${JSON.stringify(params)}` : key) as unknown as TFunction;

  const base = {
    paymentOrigin: 'external',
    verificationStatus: 'organizer_confirmed',
    confirmedAt: '2026-10-10T15:08:47Z',
    confirmedBy: { userId: null, displayName: null },
  };

  it('never produces the "Unknown reporter on —" sentence', () => {
    for (const item of [
      { ...base, reportedBy: null, reportedAt: null },
      { ...base, reportedBy: { userId: 'u', displayName: 'Mia' }, reportedAt: null },
      { ...base, reportedBy: null, reportedAt: '2026-10-10T15:00:00Z' },
      { ...base, reportedBy: { userId: 'u', displayName: ' ' }, reportedAt: 'not a date' },
    ]) {
      const text = externalContributionProvenanceText(item, t) ?? '';
      expect(text).not.toContain('unknownReporter');
      expect(text).not.toContain('provenance.confirmed|');
      expect(text).toContain('provenance.activityConfirmed');
      expect(text).toContain('provenance.organizer');
    }
  });

  it('uses the full sentence when reporter and time are known', () => {
    const text =
      externalContributionProvenanceText(
        {
          ...base,
          reportedBy: { userId: 'u', displayName: 'Mia Member' },
          reportedAt: '2026-10-10T15:00:00Z',
        },
        t,
      ) ?? '';
    expect(text.startsWith('ledger:provenance.confirmed|')).toBe(true);
    expect(text).toContain('Mia Member');
  });

  it('falls back cleanly when even the confirmation time is missing', () => {
    const text =
      externalContributionProvenanceText(
        { ...base, confirmedAt: null, reportedBy: null, reportedAt: null },
        t,
      ) ?? '';
    expect(text.startsWith('ledger:provenance.confirmedNoDate')).toBe(true);
  });

  it('guards pending and rejected sentences the same way', () => {
    expect(
      externalContributionProvenanceText(
        { paymentOrigin: 'external', verificationStatus: 'pending_organizer_confirmation' },
        t,
      ),
    ).toBe('ledger:provenance.pendingNoReporter');
    expect(
      externalContributionProvenanceText(
        { paymentOrigin: 'external', verificationStatus: 'organizer_rejected' },
        t,
      ),
    ).toMatch(/^ledger:provenance\.rejectedNoDate/);
  });

  it('shows nothing for payments that are not external', () => {
    expect(externalContributionProvenanceText({ paymentOrigin: 'stripe' }, t)).toBeNull();
  });
});

describe('status tones', () => {
  it('colors each state consistently', () => {
    expect(contributionTone('confirmed')).toBe('success');
    expect(contributionTone('submitted')).toBe('info');
    expect(contributionTone('late')).toBe('warning');
    expect(contributionTone('rejected')).toBe('danger');
    expect(contributionTone('missed')).toBe('danger');
    expect(contributionTone('due')).toBe('neutral');
    expect(payoutTone('pending')).toBe('info');
    expect(payoutTone('released')).toBe('success');
    expect(roundTone('open')).toBe('info');
    expect(roundTone('closed')).toBe('success');
  });
});

describe('saved document types', () => {
  it('tells record documents from member statements', () => {
    expect(documentTypeKey('circuSave_contribution_record')).toBe('contribution');
    expect(documentTypeKey('circuSave_payout_record')).toBe('payout');
    expect(documentTypeKey('circuSave_round_record')).toBe('round');
    expect(documentTypeKey('circuSave_member_circle_statement')).toBe('statement');
    expect(documentTypeKey(undefined)).toBe('statement');
    expect(documentTypeKey('something_new')).toBe('statement');
  });
});

describe('downloaded file names', () => {
  it('names a record document after its document number and keeps the statement name', () => {
    expect(pdfFilenameForReference('CSC-4D1BAC-R01-P02-FK-D01')).toBe('CircuSave_CSC-4D1BAC-R01-P02-FK-D01.pdf');
    expect(pdfFilenameForReference('CSP-4D1BAC-R01-P01-1D-D02')).toBe('CircuSave_CSP-4D1BAC-R01-P01-1D-D02.pdf');
    expect(pdfFilenameForReference('CSR-4D1BAC-R01-G4-D01')).toBe('CircuSave_CSR-4D1BAC-R01-G4-D01.pdf');
    expect(pdfFilenameForReference('MCS-4D1BAC-389FFA-20261010153809-FA9')).toBe(
      'CircuSave_Member_Circle_Statement_MCS-4D1BAC-389FFA-20261010153809-FA9.pdf',
    );
    expect(pdfFilenameForReference('weird ref/../x')).toBe('CircuSave_Member_Circle_Statement_weird_ref____x.pdf');
  });
});
