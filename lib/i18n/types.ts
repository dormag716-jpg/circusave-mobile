export const SUPPORTED_LANGUAGES = ['en', 'es', 'ht'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = 'system' | SupportedLanguage;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'circusave.language';

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: LanguagePreference;
  label: string;
}> = [
  { value: 'system', label: 'Use phone language' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ht', label: 'Kreyòl ayisyen' },
];

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}
