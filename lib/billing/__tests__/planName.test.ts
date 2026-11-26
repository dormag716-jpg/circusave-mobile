import { readFileSync } from 'fs';
import path from 'path';

import { paidPlanNameKey } from '../planName';

const LOCALES = ['en', 'es', 'ht'] as const;

function locale(loc: string, file: string): Record<string, string> {
  return JSON.parse(
    readFileSync(path.join(__dirname, '..', '..', 'i18n', 'locales', loc, `${file}.json`), 'utf8'),
  );
}

describe('paid plan name', () => {
  it('names the plan the account is on', () => {
    expect(paidPlanNameKey('member_pro')).toBe('tierMemberProName');
    expect(paidPlanNameKey('organizer_pro')).toBe('tierOrganizerProName');
  });

  it('treats a paid account with no readable tier as Organizer Pro', () => {
    expect(paidPlanNameKey(undefined)).toBe('tierOrganizerProName');
    expect(paidPlanNameKey(null)).toBe('tierOrganizerProName');
  });
});

describe('active-plan banner copy', () => {
  it.each(LOCALES)('%s names the plan through a placeholder, not a fixed plan', (loc) => {
    for (const file of ['subscription', 'settings']) {
      const copy = locale(loc, file);
      expect(copy.planActive).toContain('{{plan}}');
      expect(copy.planActive).not.toMatch(/Organizer Pro|Member Pro/);
    }
    // The old fixed-name strings are gone.
    expect(locale(loc, 'subscription').active).toBeUndefined();
    expect(locale(loc, 'subscription').playSucceededTitle).toBeUndefined();
    expect(locale(loc, 'settings').organizerProActive).toBeUndefined();
    expect(locale(loc, 'settings').organizerProBadge).toBeUndefined();
  });

  it('both screens pass the account tier name into the banner', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const settings = readFileSync(path.join(root, 'app', '(tabs)', 'settings.tsx'), 'utf8');
    const subscription = readFileSync(path.join(root, 'app', 'subscription.tsx'), 'utf8');
    expect(settings).toContain('paidPlanNameKey(entitlements.tier)');
    expect(settings).toContain("t('settings:planActive', { plan: planName })");
    expect(subscription).toContain('paidPlanNameKey(entitlements.tier)');
    expect(subscription).toContain("t('planActive', { plan: activePlanName })");
    expect(settings).not.toMatch(/organizerProActive|organizerProBadge/);
    expect(subscription).not.toMatch(/t\('active'\)|playSucceededTitle/);
  });
});
