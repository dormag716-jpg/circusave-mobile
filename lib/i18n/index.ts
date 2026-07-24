import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import authEn from './locales/en/auth.json';
import circleWorkspaceEn from './locales/en/circleWorkspace.json';
import circlesEn from './locales/en/circles.json';
import commonEn from './locales/en/common.json';
import createCircleEn from './locales/en/createCircle.json';
import dashboardEn from './locales/en/dashboard.json';
import deviceLockEn from './locales/en/deviceLock.json';
import inviteEn from './locales/en/invite.json';
import joinCircleEn from './locales/en/joinCircle.json';
import navigationEn from './locales/en/navigation.json';
import payoutOrderEn from './locales/en/payoutOrder.json';
import peopleEn from './locales/en/people.json';
import settingsEn from './locales/en/settings.json';
import authEs from './locales/es/auth.json';
import circleWorkspaceEs from './locales/es/circleWorkspace.json';
import circlesEs from './locales/es/circles.json';
import commonEs from './locales/es/common.json';
import createCircleEs from './locales/es/createCircle.json';
import dashboardEs from './locales/es/dashboard.json';
import deviceLockEs from './locales/es/deviceLock.json';
import inviteEs from './locales/es/invite.json';
import joinCircleEs from './locales/es/joinCircle.json';
import navigationEs from './locales/es/navigation.json';
import payoutOrderEs from './locales/es/payoutOrder.json';
import peopleEs from './locales/es/people.json';
import settingsEs from './locales/es/settings.json';
import authHt from './locales/ht/auth.json';
import circleWorkspaceHt from './locales/ht/circleWorkspace.json';
import circlesHt from './locales/ht/circles.json';
import commonHt from './locales/ht/common.json';
import createCircleHt from './locales/ht/createCircle.json';
import dashboardHt from './locales/ht/dashboard.json';
import deviceLockHt from './locales/ht/deviceLock.json';
import inviteHt from './locales/ht/invite.json';
import joinCircleHt from './locales/ht/joinCircle.json';
import navigationHt from './locales/ht/navigation.json';
import payoutOrderHt from './locales/ht/payoutOrder.json';
import peopleHt from './locales/ht/people.json';
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
    circleWorkspace: circleWorkspaceEn,
    circles: circlesEn,
    common: commonEn,
    createCircle: createCircleEn,
    dashboard: dashboardEn,
    deviceLock: deviceLockEn,
    invite: inviteEn,
    joinCircle: joinCircleEn,
    navigation: navigationEn,
    payoutOrder: payoutOrderEn,
    people: peopleEn,
    settings: settingsEn,
  },
  es: {
    auth: authEs,
    circleWorkspace: circleWorkspaceEs,
    circles: circlesEs,
    common: commonEs,
    createCircle: createCircleEs,
    dashboard: dashboardEs,
    deviceLock: deviceLockEs,
    invite: inviteEs,
    joinCircle: joinCircleEs,
    navigation: navigationEs,
    payoutOrder: payoutOrderEs,
    people: peopleEs,
    settings: settingsEs,
  },
  ht: {
    auth: authHt,
    circleWorkspace: circleWorkspaceHt,
    circles: circlesHt,
    common: commonHt,
    createCircle: createCircleHt,
    dashboard: dashboardHt,
    deviceLock: deviceLockHt,
    invite: inviteHt,
    joinCircle: joinCircleHt,
    navigation: navigationHt,
    payoutOrder: payoutOrderHt,
    people: peopleHt,
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
      'circleWorkspace',
      'circles',
      'common',
      'createCircle',
      'dashboard',
      'deviceLock',
      'invite',
      'joinCircle',
      'navigation',
      'payoutOrder',
      'people',
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
