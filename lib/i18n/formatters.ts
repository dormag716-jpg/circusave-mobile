import type { SupportedLanguage } from './types';

const LANGUAGE_LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-419',
  ht: 'ht-HT',
};

export function getFormattingLocale(language: string): string {
  const normalized = language.split('-')[0] as SupportedLanguage;
  return LANGUAGE_LOCALES[normalized] ?? LANGUAGE_LOCALES.en;
}

export function formatCurrency(
  amount: number,
  language: string,
  currencyCode = 'USD',
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(getFormattingLocale(language), {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits,
  }).format(amount);
}

export function formatShortDate(value: string, language: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getFormattingLocale(language), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string, language: string): string {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getFormattingLocale(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Manual relative-day labels when Intl.RelativeTimeFormat is unavailable
 * (common on Hermes / React Native). Mirrors numeric:'auto' day units.
 */
function formatRelativeDateFallback(days: number, language: string): string {
  const code = language.split('-')[0] as SupportedLanguage;
  const lang: SupportedLanguage =
    code === 'es' || code === 'ht' || code === 'en' ? code : 'en';

  if (days === 0) {
    if (lang === 'es') return 'hoy';
    if (lang === 'ht') return 'jodi a';
    return 'today';
  }
  if (days === 1) {
    if (lang === 'es') return 'mañana';
    if (lang === 'ht') return 'demen';
    return 'tomorrow';
  }
  if (days === -1) {
    if (lang === 'es') return 'ayer';
    if (lang === 'ht') return 'yè';
    return 'yesterday';
  }

  const count = Math.abs(days);
  if (days > 1) {
    if (lang === 'es') return `dentro de ${count} días`;
    if (lang === 'ht') return `nan ${count} jou`;
    return `in ${count} days`;
  }

  // days < -1
  if (lang === 'es') return `hace ${count} días`;
  if (lang === 'ht') return `${count} jou pase`;
  return `${count} days ago`;
}

export function formatRelativeDate(
  value: string,
  language: string,
  now = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);

  const RelativeTimeFormatCtor = (
    typeof Intl !== 'undefined'
      ? (Intl as typeof Intl & {
          RelativeTimeFormat?: new (
            locales?: string | string[],
            options?: Intl.RelativeTimeFormatOptions,
          ) => Intl.RelativeTimeFormat;
        }).RelativeTimeFormat
      : undefined
  );

  if (typeof RelativeTimeFormatCtor === 'function') {
    return new RelativeTimeFormatCtor(getFormattingLocale(language), {
      numeric: 'auto',
    }).format(days, 'day');
  }

  return formatRelativeDateFallback(days, language);
}

export function formatPercentage(value: number, language: string): string {
  return new Intl.NumberFormat(getFormattingLocale(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatOrdinal(position: number, language: string): string {
  const value = Math.max(0, Math.trunc(position));
  const normalized = language.split('-')[0] as SupportedLanguage;

  if (normalized === 'es') {
    return `${value}.º`;
  }
  if (normalized === 'ht') {
    return value === 1 ? '1ye' : `${value}yèm`;
  }

  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? 'th'
      : lastDigit === 1
        ? 'st'
        : lastDigit === 2
          ? 'nd'
          : lastDigit === 3
            ? 'rd'
            : 'th';
  return `${value}${suffix}`;
}
