import type { TFunction } from 'i18next';

import {
  displayMoney,
  formatDisplayDateTime,
  humanizeEventType,
  humanizeStatus,
  memberContextLabel,
  nextContributionDue,
  nextScheduledPayout,
  shortStatementId,
  OUTSTANDING_FIELD_NOTE,
} from '@/lib/statementPresentation';
import ledgerEn from '@/lib/i18n/locales/en/ledger.json';
import ledgerEs from '@/lib/i18n/locales/es/ledger.json';
import ledgerHt from '@/lib/i18n/locales/ht/ledger.json';

describe('statementPresentation', () => {
  test('humanizes statuses and events without mutating source keys', () => {
    expect(humanizeStatus('confirmed')).toBe('Contribution confirmed');
    expect(humanizeStatus('due')).toBe('Payment due');
    expect(humanizeStatus('late')).toBe('Submitted after due time');
    expect(humanizeEventType('contribution_confirmed')).toBe(
      'Contribution confirmed',
    );
    expect(humanizeEventType('member_approved')).toBe('Member approved');
    expect(humanizeEventType('contribution_late')).toBe(
      'Submitted after due time',
    );
  });

  test('humanizeStatus uses translator output when provided', () => {
    const t = ((key: string) =>
      key === 'humanize.confirmed' ? 'Contribución confirmada' : '') as TFunction;
    expect(humanizeStatus('confirmed', t)).toBe('Contribución confirmada');
    expect(humanizeStatus('due', t)).toBe('Payment due');
  });

  test('formats timestamps readably and shortens statement ids', () => {
    const formatted = formatDisplayDateTime('2026-07-31T04:14:34Z');
    expect(formatted).not.toContain('T04:14:34Z');
    expect(formatted).toMatch(/2026/);
    expect(
      shortStatementId('MCS-CIRCLE-MEMBER-20260731041434-51673D9D'),
    ).toBe('51673D9D');
  });

  test('keeps hand wording singular and plural', () => {
    expect(
      memberContextLabel({
        handCount: 1,
        roleSummary: 'participant',
        membershipStatus: 'active',
      }),
    ).toBe('Active member \u00B7 1 hand');
    expect(
      memberContextLabel({
        handCount: 2,
        roleSummary: 'organizer',
        membershipStatus: 'active',
      }),
    ).toBe('Organizer \u00B7 2 hands');
  });

  test('displayMoney preserves backend display strings only', () => {
    expect(displayMoney('$2,000')).toBe('$2,000');
    expect(displayMoney('Unavailable')).toBe('Unavailable');
    expect(displayMoney(null)).toBe('Unavailable');
    expect(displayMoney(undefined)).toBe('Unavailable');
  });

  test('next due helpers use snapshot fields only', () => {
    expect(
      nextContributionDue([
        {
          contributionId: 'c1',
          roundNumber: 2,
          dueDate: '2026-08-01',
          status: 'due',
          expectedDisplay: '$100',
          paidDisplay: '$0',
        },
        {
          contributionId: 'c0',
          roundNumber: 1,
          dueDate: '2026-07-01',
          status: 'confirmed',
          expectedDisplay: '$100',
          paidDisplay: '$100',
        },
      ])?.roundNumber,
    ).toBe(2);

    expect(
      nextScheduledPayout([
        {
          roundNumber: 5,
          dueDate: '2026-09-01',
          amountDisplay: '$1,000',
          status: 'scheduled',
        },
      ])?.roundNumber,
    ).toBe(5);
  });

  test('documents Outstanding mapping note for remaining obligations', () => {
    expect(OUTSTANDING_FIELD_NOTE).toMatch(/remainingObligations/);
  });

  test('localizes external-report provenance in all supported languages', () => {
    expect(ledgerEn.provenance.pending).toBe(
      'Externally reported by {{member}} on {{date}}. Awaiting organizer confirmation.',
    );
    expect(ledgerEn.provenance.confirmed).toContain('Confirmed by {{organizer}}');
    expect(ledgerEn.provenance.rejected).toContain('This contribution remains due.');
    expect(ledgerEs.provenance.pending).toContain('confirmación del organizador');
    expect(ledgerEs.provenance.confirmed).toContain('Confirmado por');
    expect(ledgerEs.provenance.rejected).toContain('sigue pendiente');
    expect(ledgerHt.provenance.pending).toContain('konfimasyon òganizatè');
    expect(ledgerHt.provenance.confirmed).toContain('konfime');
    expect(ledgerHt.provenance.rejected).toContain('toujou dwe');
  });
});
