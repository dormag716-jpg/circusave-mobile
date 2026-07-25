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
  return new Intl.RelativeTimeFormat(getFormattingLocale(language), {
    numeric: 'auto',
  }).format(days, 'day');
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

  const category = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(value);
  const suffix =
    category === 'one'
      ? 'st'
      : category === 'two'
        ? 'nd'
        : category === 'few'
          ? 'rd'
          : 'th';
  return `${value}${suffix}`;
}
