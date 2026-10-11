import { readdirSync, readFileSync } from 'fs';
import path from 'path';

import ledgerEn from '@/lib/i18n/locales/en/ledger.json';
import ledgerEs from '@/lib/i18n/locales/es/ledger.json';
import ledgerHt from '@/lib/i18n/locales/ht/ledger.json';
import recordsEn from '@/lib/i18n/locales/en/records.json';
import recordsEs from '@/lib/i18n/locales/es/records.json';
import recordsHt from '@/lib/i18n/locales/ht/records.json';

type Json = { [key: string]: Json | string };

function flatten(node: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const NEW_LEDGER_KEYS = [
  'provenance.pendingNoReporter',
  'provenance.confirmedNoDate',
  'provenance.rejectedNoDate',
  'center.statementsSubMember',
  'center.statementsHintMember',
];

describe('records copy', () => {
  const en = flatten(recordsEn as Json);
  const es = flatten(recordsEs as Json);
  const ht = flatten(recordsHt as Json);

  it('has the same keys in en, es and ht', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ht).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty values', () => {
    for (const dict of [en, es, ht]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(key).toBeTruthy();
      }
    }
  });

  it('uses the same placeholders in every language', () => {
    for (const key of Object.keys(en)) {
      expect(placeholders(es[key])).toEqual(placeholders(en[key]));
      expect(placeholders(ht[key])).toEqual(placeholders(en[key]));
    }
  });

  it('labels a pending payout "Scheduled" and has no ready state', () => {
    expect(en['status.payout.scheduled']).toBe('Scheduled');
    expect(Object.keys(en).filter((k) => /ready/i.test(k))).toEqual([]);
  });

  it('has the new ledger sentences in every language', () => {
    for (const ledger of [ledgerEn, ledgerEs, ledgerHt]) {
      const flat = flatten(ledger as unknown as Json);
      for (const key of NEW_LEDGER_KEYS) {
        expect((flat[key] || '').trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('records copy hygiene', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const sources = ['components/records', 'lib/records']
    .flatMap((dir) =>
      readdirSync(path.join(root, dir))
        .filter((file) => /\.(ts|tsx)$/.test(file))
        .map((file) => readFileSync(path.join(root, dir, file), 'utf8')),
    )
    .join('\n');
  const used = (key: string) =>
    sources.includes(`'${key}'`) || sources.includes(`'records:${key}'`);

  it('has no unused records copy (every key is used by the screens)', () => {
    const unused = Object.keys(flatten(recordsEn as Json)).filter((key) => {
      if (used(key)) return false;
      // Keys built from a template, e.g. `status.contribution.${key}`.
      const parent = key.split('.').slice(0, -1).join('.');
      if (sources.includes(`${parent}.${'$'}{`) || sources.includes(`records:${parent}.${'$'}{`)) {
        return false;
      }
      // Plural pairs (needsReview_one / _other) share one lookup.
      if (/_(one|other)$/.test(key)) return !used(key.replace(/_(one|other)$/, ''));
      return true;
    });
    expect(unused).toEqual([]);
  });

  it('can never render "Unknown reporter": the copy and every reference are gone', () => {
    for (const ledger of [ledgerEn, ledgerEs, ledgerHt]) {
      expect(JSON.stringify(ledger)).not.toContain('Unknown reporter');
      expect(Object.keys((ledger as unknown as { provenance: object }).provenance)).not.toContain(
        'unknownReporter',
      );
    }
    expect(sources).not.toContain('unknownReporter');
  });
});
