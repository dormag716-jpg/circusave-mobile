import { readFileSync } from 'fs';
import path from 'path';

import activityEn from '../i18n/locales/en/activity.json';
import activityEs from '../i18n/locales/es/activity.json';
import activityHt from '../i18n/locales/ht/activity.json';

const source = readFileSync(
  path.join(__dirname, '../../app/(tabs)/activity.tsx'),
  'utf8',
);

describe('activity screen premium contracts', () => {
  test('opens circle Records from a feed row', () => {
    expect(source).toContain("circleWorkspaceHref(entry.circleId, 'records')");
  });

  test('exports a PDF report as the primary share and CSV as a secondary option', () => {
    expect(source).toContain('Print.printToFileAsync');
    expect(source).toContain('buildActivityReportHtml');
    expect(source).toContain("mimeType: 'application/pdf'");
    expect(source).toContain("UTI: 'com.adobe.pdf'");
    expect(source).toContain("t('activity:exportPdf')");
    expect(source).toContain("t('activity:exportCsv')");
    expect(source).toContain('buildActivityCsv');
    expect(source).toContain('Sharing.shareAsync');
    expect(source).not.toContain('exportUnavailableTitle');
    expect(activityEn.exportPdf).toBe('Export PDF report');
    expect(activityEn.exportCsv).toBe('Export CSV data');
  });

  test('blocks duplicate export taps with a shared lock', () => {
    expect(source).toContain('exportingRef');
    expect(source).toContain('canBeginActivityExport');
    expect(source).toContain('disabled={exporting}');
    expect(source).toContain('endExport()');
  });

  test('gates history and export on the fullActivityHistory entitlement', () => {
    expect(source).toContain("hasCapability('fullActivityHistory')");
    expect(source).toContain('presentActivityFeed');
    expect(source).toContain('activityRequestParams');
    expect(source).toContain('activityExportEntries');
  });

  test('all three locales include PDF report copy', () => {
    for (const pack of [activityEn, activityEs, activityHt]) {
      expect(pack.exportPdf.trim().length).toBeGreaterThan(0);
      expect(pack.exportCsv.trim().length).toBeGreaterThan(0);
      expect(pack.report.title.trim().length).toBeGreaterThan(0);
      expect(pack.report.informational).not.toMatch(/Member Activity Statement/i);
      expect(pack.report.recordsNote.trim().length).toBeGreaterThan(0);
      expect(pack.report.partialScope.trim().length).toBeGreaterThan(0);
    }
  });
});
