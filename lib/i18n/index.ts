import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import authEn from './locales/en/auth.json';
import circlesEn from './locales/en/circles.json';
import commonEn from './locales/en/common.json';
import dashboardEn from './locales/en/dashboard.json';
import deviceLockEn from './locales/en/deviceLock.json';
import navigationEn from './locales/en/navigation.json';
import settingsEn from './locales/en/settings.json';
import authEs from './locales/es/auth.json';
import circlesEs from './locales/es/circles.json';
import commonEs from './locales/es/common.json';
import dashboardEs from './locales/es/dashboard.json';
import deviceLockEs from './locales/es/deviceLock.json';
import navigationEs from './locales/es/navigation.json';
import settingsEs from './locales/es/settings.json';
import authHt from './locales/ht/auth.json';
import circlesHt from './locales/ht/circles.json';
import commonHt from './locales/ht/common.json';
import dashboardHt from './locales/ht/dashboard.json';
import deviceLockHt from './locales/ht/deviceLock.json';
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
  en: {
    auth: authEn,
    circles: circlesEn,
    common: commonEn,
    dashboard: dashboardEn,
    deviceLock: deviceLockEn,
    navigation: navigationEn,
    settings: settingsEn,
  },
  es: {
    auth: authEs,
    circles: circlesEs,
    common: commonEs,
    dashboard: dashboardEs,
    deviceLock: deviceLockEs,
    navigation: navigationEs,
    settings: settingsEs,
  },
  ht: {
    auth: authHt,
    circles: circlesHt,
    common: commonHt,
    dashboard: dashboardHt,
    deviceLock: deviceLockHt,
    navigation: navigationHt,
    settings: settingsHt,
  },
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
    ns: [
      'auth',
      'circles',
      'common',
      'dashboard',
      'deviceLock',
      'navigation',
      'settings',
    ],
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
