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
