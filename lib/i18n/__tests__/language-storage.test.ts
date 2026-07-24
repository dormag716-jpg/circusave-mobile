const asyncStorageValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => asyncStorageValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageValues.set(key, value);
    }),
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));

jest.mock('../../api', () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  getAuthSession: jest.fn(),
  logout: jest.fn(),
}));

import { clearAuthSession } from '../../auth';
import {
  readLanguagePreference,
  writeLanguagePreference,
} from '../language-storage';
import { LANGUAGE_STORAGE_KEY } from '../types';

describe('language preference storage', () => {
  beforeEach(() => {
    asyncStorageValues.clear();
  });

  test('saved language survives a simulated restart read', async () => {
    await writeLanguagePreference('es');

    expect(await readLanguagePreference()).toBe('es');
  });

  test('logout does not clear the device language preference', async () => {
    await writeLanguagePreference('ht');

    await clearAuthSession();

    expect(await readLanguagePreference()).toBe('ht');
  });

  test('invalid stored values fall back to system', async () => {
    asyncStorageValues.set(LANGUAGE_STORAGE_KEY, 'unsupported');

    expect(await readLanguagePreference()).toBe('system');
  });

  test('missing preference falls back to system', async () => {
    expect(await readLanguagePreference()).toBe('system');
  });
});
