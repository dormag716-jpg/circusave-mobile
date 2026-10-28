import type { TFunction } from 'i18next';

export type CircleFrequencyKey = 'weekly' | 'biweekly' | 'monthly';

export function normalizeFrequencyKey(frequency: string): CircleFrequencyKey {
  const normalized = String(frequency || '')
    .toLowerCase()
    .replace(/[_-\s]/g, '');
  if (normalized === 'biweekly') return 'biweekly';
  if (normalized === 'monthly') return 'monthly';
  return 'weekly';
}

export function reminderMemberFrequencySummary(
  t: TFunction,
  memberCount: number,
  frequency: string,
): string {
  const count = Number.isFinite(memberCount) ? Math.max(0, Math.trunc(memberCount)) : 0;
  const frequencyLabel = t(`circles:frequency.${normalizeFrequencyKey(frequency)}`);
  return t('settings:smartRemindersMemberSummary', {
    count,
    frequency: frequencyLabel,
  });
}
