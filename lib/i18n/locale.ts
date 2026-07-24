import { getLocales } from 'expo-localization';

import {
  DEFAULT_LANGUAGE,
  type LanguagePreference,
  type SupportedLanguage,
} from './types';

export function normalizeLanguageTag(languageTag: string | null | undefined): SupportedLanguage {
  const primaryLanguage = String(languageTag || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];

  if (primaryLanguage === 'en' || primaryLanguage === 'es' || primaryLanguage === 'ht') {
    return primaryLanguage;
  }

  return DEFAULT_LANGUAGE;
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  deviceLanguageTags: readonly string[],
): SupportedLanguage {
  if (preference !== 'system') {
    return preference;
  }

  return normalizeLanguageTag(deviceLanguageTags[0]);
}

export function getDeviceLanguageTags(): string[] {
  return getLocales().map((locale) => locale.languageTag);
}

export function resolveCurrentLanguage(
  preference: LanguagePreference,
): SupportedLanguage {
  return resolveLanguagePreference(preference, getDeviceLanguageTags());
}
