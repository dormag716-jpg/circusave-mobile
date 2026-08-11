import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import authEn from './locales/en/auth.json';
import agreementsEn from './locales/en/agreements.json';
import activityEn from './locales/en/activity.json';
import assistantEn from './locales/en/assistant.json';
import circleWorkspaceEn from './locales/en/circleWorkspace.json';
import circlesEn from './locales/en/circles.json';
import commonEn from './locales/en/common.json';
import contributionsEn from './locales/en/contributions.json';
import createCircleEn from './locales/en/createCircle.json';
import dashboardEn from './locales/en/dashboard.json';
import deviceLockEn from './locales/en/deviceLock.json';
import financialErrorsEn from './locales/en/financialErrors.json';
import inviteEn from './locales/en/invite.json';
import joinCircleEn from './locales/en/joinCircle.json';
import ledgerEn from './locales/en/ledger.json';
import navigationEn from './locales/en/navigation.json';
import notificationsEn from './locales/en/notifications.json';
import payoutOrderEn from './locales/en/payoutOrder.json';
import peopleEn from './locales/en/people.json';
import roundsEn from './locales/en/rounds.json';
import scheduleEn from './locales/en/schedule.json';
import settingsEn from './locales/en/settings.json';
import walletEn from './locales/en/wallet.json';
import activityEs from './locales/es/activity.json';
import authEs from './locales/es/auth.json';
import agreementsEs from './locales/es/agreements.json';
import assistantEs from './locales/es/assistant.json';
import circleWorkspaceEs from './locales/es/circleWorkspace.json';
import circlesEs from './locales/es/circles.json';
import commonEs from './locales/es/common.json';
import contributionsEs from './locales/es/contributions.json';
import createCircleEs from './locales/es/createCircle.json';
import dashboardEs from './locales/es/dashboard.json';
import deviceLockEs from './locales/es/deviceLock.json';
import financialErrorsEs from './locales/es/financialErrors.json';
import inviteEs from './locales/es/invite.json';
import joinCircleEs from './locales/es/joinCircle.json';
import ledgerEs from './locales/es/ledger.json';
import navigationEs from './locales/es/navigation.json';
import notificationsEs from './locales/es/notifications.json';
import payoutOrderEs from './locales/es/payoutOrder.json';
import peopleEs from './locales/es/people.json';
import roundsEs from './locales/es/rounds.json';
import scheduleEs from './locales/es/schedule.json';
import settingsEs from './locales/es/settings.json';
import walletEs from './locales/es/wallet.json';
import activityHt from './locales/ht/activity.json';
import authHt from './locales/ht/auth.json';
import agreementsHt from './locales/ht/agreements.json';
import assistantHt from './locales/ht/assistant.json';
import circleWorkspaceHt from './locales/ht/circleWorkspace.json';
import circlesHt from './locales/ht/circles.json';
import commonHt from './locales/ht/common.json';
import contributionsHt from './locales/ht/contributions.json';
import createCircleHt from './locales/ht/createCircle.json';
import dashboardHt from './locales/ht/dashboard.json';
import deviceLockHt from './locales/ht/deviceLock.json';
import financialErrorsHt from './locales/ht/financialErrors.json';
import inviteHt from './locales/ht/invite.json';
import joinCircleHt from './locales/ht/joinCircle.json';
import ledgerHt from './locales/ht/ledger.json';
import navigationHt from './locales/ht/navigation.json';
import notificationsHt from './locales/ht/notifications.json';
import payoutOrderHt from './locales/ht/payoutOrder.json';
import peopleHt from './locales/ht/people.json';
import roundsHt from './locales/ht/rounds.json';
import scheduleHt from './locales/ht/schedule.json';
import settingsHt from './locales/ht/settings.json';
import walletHt from './locales/ht/wallet.json';
import { readLanguagePreference, writeLanguagePreference } from './language-storage';
import { resolveCurrentLanguage } from './locale';
import {
  DEFAULT_LANGUAGE,
  type LanguagePreference,
  type SupportedLanguage,
} from './types';

const resources = {
  en: {
    agreements: agreementsEn,
    activity: activityEn,
    assistant: assistantEn,
    auth: authEn,
    circleWorkspace: circleWorkspaceEn,
    circles: circlesEn,
    common: commonEn,
    contributions: contributionsEn,
    createCircle: createCircleEn,
    dashboard: dashboardEn,
    deviceLock: deviceLockEn,
    financialErrors: financialErrorsEn,
    invite: inviteEn,
    joinCircle: joinCircleEn,
    ledger: ledgerEn,
    navigation: navigationEn,
    notifications: notificationsEn,
    payoutOrder: payoutOrderEn,
    people: peopleEn,
    rounds: roundsEn,
    schedule: scheduleEn,
    settings: settingsEn,
    wallet: walletEn,
  },
  es: {
    agreements: agreementsEs,
    activity: activityEs,
    assistant: assistantEs,
    auth: authEs,
    circleWorkspace: circleWorkspaceEs,
    circles: circlesEs,
    common: commonEs,
    contributions: contributionsEs,
    createCircle: createCircleEs,
    dashboard: dashboardEs,
    deviceLock: deviceLockEs,
    financialErrors: financialErrorsEs,
    invite: inviteEs,
    joinCircle: joinCircleEs,
    ledger: ledgerEs,
    navigation: navigationEs,
    notifications: notificationsEs,
    payoutOrder: payoutOrderEs,
    people: peopleEs,
    rounds: roundsEs,
    schedule: scheduleEs,
    settings: settingsEs,
    wallet: walletEs,
  },
  ht: {
    agreements: agreementsHt,
    activity: activityHt,
    assistant: assistantHt,
    auth: authHt,
    circleWorkspace: circleWorkspaceHt,
    circles: circlesHt,
    common: commonHt,
    contributions: contributionsHt,
    createCircle: createCircleHt,
    dashboard: dashboardHt,
    deviceLock: deviceLockHt,
    financialErrors: financialErrorsHt,
    invite: inviteHt,
    joinCircle: joinCircleHt,
    ledger: ledgerHt,
    navigation: navigationHt,
    notifications: notificationsHt,
    payoutOrder: payoutOrderHt,
    people: peopleHt,
    rounds: roundsHt,
    schedule: scheduleHt,
    settings: settingsHt,
    wallet: walletHt,
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
      'agreements',
      'activity',
      'assistant',
      'auth',
      'circleWorkspace',
      'circles',
      'common',
      'contributions',
      'createCircle',
      'dashboard',
      'deviceLock',
      'financialErrors',
      'invite',
      'joinCircle',
      'ledger',
      'navigation',
      'notifications',
      'payoutOrder',
      'people',
      'rounds',
      'schedule',
      'settings',
      'wallet',
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
