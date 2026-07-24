import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import navigationEn from './locales/en/navigation.json';
import settingsEn from './locales/en/settings.json';
import commonEs from './locales/es/common.json';
import navigationEs from './locales/es/navigation.json';
import settingsEs from './locales/es/settings.json';
import commonHt from './locales/ht/common.json';
import navigationHt from './locales/ht/navigation.json';
import settingsHt from './locales/ht/settings.json';
import { readLanguagePreference, writeLanguagePreference } from './language-storage';
import { resolveCurrentLanguage } from './locale';
import {
  DEFAULT_LANGUAGE,
  type LanguagePreference,
  type SupportedLanguage,
} from './types';

const resources = {
  en: { common: commonEn, navigation: navigationEn, settings: settingsEn },
  es: { common: commonEs, navigation: navigationEs, settings: settingsEs },
  ht: { common: commonHt, navigation: navigationHt, settings: settingsHt },
} as const;

let initializationPromise: Promise<SupportedLanguage> | null = null;

async function ensureInitialized(language: SupportedLanguage): Promise<void> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(language);
    return;
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: ['common', 'navigation', 'settings'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export function initializeI18n(): Promise<SupportedLanguage> {
  if (!initializationPromise) {
    initializationPromise = readLanguagePreference()
      .then(async (preference) => {
        const language = resolveCurrentLanguage(preference);
        await ensureInitialized(language);
        return language;
      })
      .catch(async () => {
        await ensureInitialized(DEFAULT_LANGUAGE);
        return DEFAULT_LANGUAGE;
      });
  }

  return initializationPromise;
}

export async function changeLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  const language = resolveCurrentLanguage(preference);
  await writeLanguagePreference(preference);
  await ensureInitialized(language);
  return language;
}

export { i18n };
export type { LanguagePreference, SupportedLanguage } from './types';
