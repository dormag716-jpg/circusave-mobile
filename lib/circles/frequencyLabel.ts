export type FrequencyOptionKey = 'weekly' | 'biweekly' | 'monthly';

/** Maps a backend frequency string ("weekly", "bi-weekly", "Bi_Weekly") to a schedule option key. */
export function frequencyOptionKey(value: unknown): FrequencyOptionKey | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '');
  if (normalized === 'weekly' || normalized === 'biweekly' || normalized === 'monthly') {
    return normalized;
  }
  return null;
}
