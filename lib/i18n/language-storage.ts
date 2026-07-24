import * as SecureStore from 'expo-secure-store';

import {
  LANGUAGE_STORAGE_KEY,
  isLanguagePreference,
  type LanguagePreference,
} from './types';

type LanguageStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function getAsyncStorage(): LanguageStorage | null {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    // Older development clients may not contain the newly added native module.
    return null;
  }
}

export async function readLanguagePreference(): Promise<LanguagePreference> {
  try {
    const asyncStorage = getAsyncStorage();
    const stored = asyncStorage
      ? await asyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      : await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);

    if (isLanguagePreference(stored)) {
      return stored;
    }

    if (asyncStorage && stored === null) {
      const legacyStored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
      if (isLanguagePreference(legacyStored)) {
        await asyncStorage.setItem(LANGUAGE_STORAGE_KEY, legacyStored);
        return legacyStored;
      }
    }

    return 'system';
  } catch {
    return 'system';
  }
}

export async function writeLanguagePreference(
  preference: LanguagePreference,
): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (asyncStorage) {
    await asyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    return;
  }

  await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, preference);
}
