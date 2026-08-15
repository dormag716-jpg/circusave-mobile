import { readFileSync } from 'fs';
import path from 'path';

import contributionsEn from '../i18n/locales/en/contributions.json';
import contributionsEs from '../i18n/locales/es/contributions.json';
import contributionsHt from '../i18n/locales/ht/contributions.json';

const MOJIBAKE = /Ã‚|Ã¢|Â·|â€|Å“/;

const workspaceSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
  'utf8',
);

const localeFiles = {
  en: contributionsEn,
  es: contributionsEs,
  ht: contributionsHt,
} as const;

describe('workspace UTF-8 source encoding', () => {
  test('workspace.tsx does not contain mojibake sequences', () => {
    expect(workspaceSource).not.toMatch(MOJIBAKE);
  });

  test('due-body and payout-turn are joined with a middle dot in source', () => {
    expect(workspaceSource).toContain("t('contributions:workspace.dueBody'");
    expect(workspaceSource).toContain(
      "` · ${t('contributions:workspace.payoutTurn'",
    );
    expect(workspaceSource).not.toContain(
      "` Ã‚· ${t('contributions:workspace.payoutTurn'",
    );
  });

  test('sent-action button uses a check mark after the translation, not mojibake', () => {
    expect(workspaceSource).toContain(
      "{t('contributions:workspace.sentAction')} ✓",
    );
    expect(workspaceSource).not.toContain(
      "{t('contributions:workspace.sentAction')} Ã¢",
    );
  });

  test('other visible workspace separators use a middle dot', () => {
    expect(workspaceSource).toContain('· {formatRelativeDate(dueDate, language)}');
    expect(workspaceSource).toContain(
      "` · ${circleNotStarted ? t('hands.planned') : t('hands.live')}`",
    );
    expect(workspaceSource).toContain(
      "` · ${t('payoutOrder:review.position', { position: orderIndex + 1 })}`",
    );
  });

  test.each(['en', 'es', 'ht'] as const)(
    '%s workspace-related locale files have no mojibake',
    (language) => {
      const dir = path.join(__dirname, '..', 'i18n', 'locales', language);
      for (const name of [
        'contributions.json',
        'circleWorkspace.json',
        'people.json',
        'payoutOrder.json',
        'rounds.json',
        'schedule.json',
      ]) {
        const source = readFileSync(path.join(dir, name), 'utf8');
        expect(source).not.toMatch(MOJIBAKE);
      }
    },
  );

  test.each(['en', 'es', 'ht'] as const)(
    '%s contribution workspace copy is valid UTF-8 and not mojibake',
    (language) => {
      const workspace = localeFiles[language].workspace;
      const serialized = JSON.stringify(workspace);
      expect(serialized).not.toMatch(MOJIBAKE);

      expect(workspace.dueBody).toContain('{{amount}}');
      expect(workspace.payoutTurn).toContain('{{position}}');
      expect(workspace.sentAction.length).toBeGreaterThan(0);
      expect(workspace.sentAction).not.toMatch(MOJIBAKE);
      expect(workspace.dueBody).not.toMatch(MOJIBAKE);
      expect(workspace.payoutTurn).not.toMatch(MOJIBAKE);
    },
  );

  test('composed English due + payout line has no corrupted separator', () => {
    const due = contributionsEn.workspace.dueBody.replace(
      '{{amount}}',
      '$1,000',
    );
    const turn = contributionsEn.workspace.payoutTurn.replace(
      '{{position}}',
      '5th',
    );
    const composed = `${due} · ${turn}`;
    expect(composed).toBe(
      'Your $1,000 contribution is due this round. · Your payout turn is 5th.',
    );
    expect(composed).not.toMatch(MOJIBAKE);
    expect(`${contributionsEn.workspace.sentAction} ✓`).toBe('I sent it ✓');
  });
});
