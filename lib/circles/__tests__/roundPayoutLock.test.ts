import { readFileSync } from 'fs';
import path from 'path';

import { isRoundPayoutLocked, roundHeroCollectionChip } from '../roundPayoutLock';

describe('round payout lock', () => {
  it('locks a round whose payout is recorded', () => {
    expect(isRoundPayoutLocked({ payoutRecorded: true, payoutReleased: false })).toBe(true);
  });

  it('locks a round whose payout was released', () => {
    expect(isRoundPayoutLocked({ payoutRecorded: false, payoutReleased: true })).toBe(true);
  });

  it('leaves an open round with no payout unlocked', () => {
    expect(isRoundPayoutLocked({ payoutRecorded: false, payoutReleased: false })).toBe(false);
    expect(isRoundPayoutLocked({})).toBe(false);
  });

  it('treats missing data as unlocked (the backend still enforces the rule)', () => {
    expect(isRoundPayoutLocked(undefined, null)).toBe(false);
    expect(isRoundPayoutLocked()).toBe(false);
  });

  it('locks when any one of several views of the round says so', () => {
    expect(
      isRoundPayoutLocked({ payoutRecorded: false }, undefined, { payoutRecorded: true }),
    ).toBe(true);
  });

  it('only counts an explicit true, not truthy values', () => {
    expect(isRoundPayoutLocked({ payoutRecorded: 'yes' as unknown as boolean })).toBe(false);
  });
});

describe('round hero status after a payout is recorded', () => {
  it('does not keep the collecting label when a payout exists but is not released', () => {
    expect(
      roundHeroCollectionChip({
        payoutReleased: false,
        payoutLocked: true,
        payoutReady: false,
      }),
    ).toBe('recorded');
  });

  it('keeps released ahead of the recorded lock', () => {
    expect(
      roundHeroCollectionChip({
        payoutReleased: true,
        payoutLocked: true,
        payoutReady: true,
      }),
    ).toBe('released');
  });

  it('still says collecting only when no payout is recorded', () => {
    expect(
      roundHeroCollectionChip({
        payoutReleased: false,
        payoutLocked: false,
        payoutReady: false,
      }),
    ).toBe('collecting');
    expect(
      roundHeroCollectionChip({
        payoutReleased: false,
        payoutLocked: false,
        payoutReady: true,
      }),
    ).toBe('ready');
  });
});

describe('screens stop offering actions the backend will refuse on a paid-out round', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8');
  const workspace = read('app', 'circle', 'workspace.tsx');
  const dashboard = read('app', '(tabs)', 'dashboard.tsx');
  const payment = read('app', 'payment', 'contribution.tsx');

  it('the Round tab locks every financial action and explains why', () => {
    expect(workspace).toMatch(/isRoundPayoutLocked\(\s*summary,\s*circle\.currentRoundSummary,\s*roundWorkspace/);
    expect(workspace).toMatch(/financialActionsLocked = paused \|\| closed \|\| completed \|\| roundPayoutLocked/);
    expect(workspace).toMatch(/!roundPayoutLocked &&\s*canShowBackendGatedAction/);
    expect(workspace).toMatch(/contributions:roundPaidOut\.title/);
    expect(workspace).toMatch(/contributions:roundPaidOut\.body/);
    expect(workspace).toContain('roundHeroCollectionChip');
    expect(workspace).toContain("t('rounds:status.recorded')");
    expect(workspace).toContain("t('rounds:status.recordedDetail')");
  });

  it('the dashboard does not prompt to pay or verify on a paid-out round', () => {
    expect(dashboard).toMatch(/isRoundPayoutLocked\(detail\?\.currentRoundSummary/);
  });

  it('the payment screen disables paying and shows the explanation', () => {
    expect(payment).toMatch(/backendCanSubmit && handDue && !roundPayoutLocked/);
    expect(payment).toMatch(/contributions:roundPaidOut\.title/);
  });
});

describe('paid-out explanation exists in every language', () => {
  const load = (l: string) =>
    JSON.parse(
      readFileSync(
        path.join(__dirname, '..', '..', 'i18n', 'locales', l, 'contributions.json'),
        'utf8',
      ),
    );
  it('has a title and body in en, es and ht, translated', () => {
    const en = load('en').roundPaidOut;
    expect(en.title.length).toBeGreaterThan(0);
    for (const l of ['es', 'ht']) {
      const t = load(l).roundPaidOut;
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(0);
      expect(t.title).not.toBe(en.title);
      expect(t.body).not.toBe(en.body);
    }
  });
});
