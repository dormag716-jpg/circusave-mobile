import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LANGUAGE_STORAGE_KEY,
  isLanguagePreference,
  type LanguagePreference,
} from './types';

export async function readLanguagePreference(): Promise<LanguagePreference> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguagePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export async function writeLanguagePreference(
  preference: LanguagePreference,
): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
}
