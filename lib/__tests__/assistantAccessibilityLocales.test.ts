import { readFileSync } from 'fs';
import path from 'path';

type Messages = Record<string, unknown>;
const LOCALES = ['en', 'es', 'ht'] as const;

const load = (locale: string, namespace: string): Messages =>
  JSON.parse(
    readFileSync(
      path.join(__dirname, '..', 'i18n', 'locales', locale, `${namespace}.json`),
      'utf8',
    ),
  );

const read = (messages: Messages, key: string): string | undefined => {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object') node = (node as Messages)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
};

// Every string a screen reader announces for the assistant button, the circle
// picker and the Settings entries. Labels say what a control is; hints say what
// it does.
const ACCESSIBILITY_KEYS: Array<[string, string]> = [
  ['assistant', 'fab.open'],
  ['assistant', 'fab.hint'],
  ['assistant', 'fab.resetAction'],
  ['assistant', 'fab.resetDone'],
  ['assistant', 'picker.close'],
  ['assistant', 'picker.pickA11y'],
  ['settings', 'assistantOpen'],
  ['settings', 'assistantOpenSubtitle'],
  ['settings', 'assistantOpenHint'],
  ['settings', 'assistantResetPosition'],
  ['settings', 'assistantResetSubtitle'],
  ['settings', 'assistantResetHint'],
  ['settings', 'assistantResetDone'],
];

describe('assistant accessibility strings in every language', () => {
  for (const [namespace, key] of ACCESSIBILITY_KEYS) {
    it(`${namespace}:${key} exists, is non-empty, and is translated`, () => {
      const english = read(load('en', namespace), key);
      expect(english && english.trim().length).toBeGreaterThan(0);
      for (const locale of ['es', 'ht'] as const) {
        const value = read(load(locale, namespace), key);
        expect(value && value.trim().length).toBeGreaterThan(0);
        // A translation must not just repeat the English text.
        expect(value).not.toBe(english);
      }
    });
  }

  it('describes the current behaviour: no fade-away or double-tap wording remains', () => {
    for (const locale of LOCALES) {
      const text = JSON.stringify(load(locale, 'assistant').fab).toLowerCase();
      expect(text).not.toMatch(/double|dos veces|de fwa|fade|desvanez|disparèt/);
    }
  });

  it('mentions dragging in the button hint', () => {
    expect(read(load('en', 'assistant'), 'fab.hint')).toMatch(/drag/i);
    expect(read(load('es', 'assistant'), 'fab.hint')).toMatch(/arrastra/i);
    expect(read(load('ht', 'assistant'), 'fab.hint')).toMatch(/trennen/i);
  });
});

describe('assistant controls expose those strings to screen readers', () => {
  const root = path.join(__dirname, '..', '..');
  const fab = readFileSync(path.join(root, 'components', 'AssistantFabLayer.tsx'), 'utf8');
  const picker = readFileSync(path.join(root, 'components', 'AssistantCirclePicker.tsx'), 'utf8');
  const settings = readFileSync(path.join(root, 'app', '(tabs)', 'settings.tsx'), 'utf8');

  it('the floating button has a label, a hint and a reset action', () => {
    expect(fab).toMatch(/accessibilityLabel=\{t\('fab\.open'\)\}/);
    expect(fab).toMatch(/accessibilityHint=\{t\('fab\.hint'\)\}/);
    expect(fab).toMatch(/resetPosition/);
    expect(fab).toMatch(/announceForAccessibility/);
  });

  it('the picker rows and close control are labelled', () => {
    expect(picker).toMatch(/accessibilityLabel=\{t\('picker\.close'\)\}/);
    expect(picker).toMatch(/picker\.pickA11y/);
  });

  it('Settings offers the assistant and the reset, each with a hint', () => {
    expect(settings).toMatch(/settings:assistantOpen'/);
    expect(settings).toMatch(/settings:assistantOpenHint/);
    expect(settings).toMatch(/settings:assistantResetPosition/);
    expect(settings).toMatch(/settings:assistantResetHint/);
    expect(settings).toMatch(/resetAssistantFabPlacement\(\)/);
    expect(settings).toMatch(/accessibilityHint=\{hint\}/);
  });

  it('the button listens for resets so it takes effect without a restart', () => {
    expect(fab).toMatch(/subscribeAssistantFabReset/);
  });
});
