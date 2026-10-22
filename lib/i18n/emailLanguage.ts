import i18n from 'i18next';

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from './types';

/**
 * The language the person is using in the app, as the Backend expects it for account emails
 * (en, es or ht). Anything else is English; the Backend checks it again.
 */
export function toEmailLanguage(value: unknown): SupportedLanguage {
  if (typeof value !== 'string') {
    return DEFAULT_LANGUAGE;
  }
  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : DEFAULT_LANGUAGE;
}

export function currentEmailLanguage(): SupportedLanguage {
  return toEmailLanguage(i18n.resolvedLanguage ?? i18n.language);
}
