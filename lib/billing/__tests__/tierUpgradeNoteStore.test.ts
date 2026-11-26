import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const LOCALES = ['en', 'es', 'ht'] as const;

function copy(loc: string): Record<string, string> {
  return JSON.parse(
    readFileSync(path.join(ROOT, 'lib', 'i18n', 'locales', loc, 'subscription.json'), 'utf8'),
  );
}

describe('upgrade note names the right store', () => {
  it.each(LOCALES)('%s has an Apple upgrade note that does not mention Google Play', (loc) => {
    const c = copy(loc);
    expect(c.tierUpgradeNoteApple).toBeTruthy();
    expect(c.tierUpgradeNoteApple).not.toMatch(/Google|Play/);
    expect(c.tierUpgradeNoteApple).toMatch(/App Store/);
    // The Google Play note stays for Android.
    expect(c.tierUpgradeNote).toMatch(/Google Play/);
  });

  it('the iPhone Plans screen passes the Apple note into the plan cards', () => {
    const screen = readFileSync(path.join(ROOT, 'app', 'subscription.tsx'), 'utf8');
    const section = readFileSync(
      path.join(ROOT, 'components', 'subscription', 'TierPlansSection.tsx'),
      'utf8',
    );
    expect(screen).toContain("upgradeNote={isIos ? t('tierUpgradeNoteApple') : undefined}");
    expect(section).toContain("upgradeNote ?? t('tierUpgradeNote')");
  });
});
