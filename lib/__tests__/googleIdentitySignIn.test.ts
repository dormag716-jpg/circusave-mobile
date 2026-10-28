import { GoogleOneTapSignIn, statusCodes } from 'react-native-nitro-google-signin';

import { requestGoogleIdentity } from '../auth/googleIdentitySignIn';

const WEB_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
const RAW_NONCE = 'raw-nonce-for-backend';
const NONCE_HASH = 'hashed-nonce-for-google';
const ID_TOKEN = 'google-id-token-value';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('@/lib/shared/config', () => ({
  GOOGLE_WEB_CLIENT_ID: 'test-web-client.apps.googleusercontent.com',
  GOOGLE_IOS_CLIENT_ID: '',
}));

jest.mock('@/lib/auth/federatedSignIn', () => ({
  createAuthNonce: () => ({
    raw: 'raw-nonce-for-backend',
    hash: 'hashed-nonce-for-google',
  }),
}));

const google = GoogleOneTapSignIn as unknown as {
  configure: jest.Mock;
  checkPlayServices: jest.Mock;
  signIn: jest.Mock;
  createAccount: jest.Mock;
  presentExplicitSignIn: jest.Mock;
};

function nativeFailure(code: string): { code: string; message: string } {
  return { code, message: 'native-detail-not-for-users' };
}

describe('requestGoogleIdentity', () => {
  let consoleText = '';

  beforeEach(() => {
    consoleText = '';
    const record = (...args: unknown[]) => {
      consoleText += `${JSON.stringify(args)}\n`;
    };
    jest.spyOn(console, 'log').mockImplementation(record);
    jest.spyOn(console, 'info').mockImplementation(record);
    jest.spyOn(console, 'warn').mockImplementation(record);
    jest.spyOn(console, 'error').mockImplementation(record);
    jest.spyOn(console, 'debug').mockImplementation(record);
    google.configure.mockReset();
    google.checkPlayServices.mockReset();
    google.checkPlayServices.mockResolvedValue(undefined);
    google.signIn.mockReset();
    google.createAccount.mockReset();
    google.presentExplicitSignIn.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    expect(consoleText).not.toContain(RAW_NONCE);
    expect(consoleText).not.toContain(NONCE_HASH);
    expect(consoleText).not.toContain(ID_TOKEN);
  });

  it('configures Google with the web client id and nonce hash, then returns the raw nonce', async () => {
    google.signIn.mockResolvedValue({
      type: 'success',
      data: { idToken: ID_TOKEN, user: { name: 'Amina Cole' } },
    });

    const result = await requestGoogleIdentity();

    expect(google.configure).toHaveBeenCalledWith({
      webClientId: WEB_CLIENT_ID,
      iosClientId: null,
      nonce: NONCE_HASH,
      offlineAccess: false,
    });
    expect(google.checkPlayServices).toHaveBeenCalledWith(false);
    expect(result).toEqual({
      status: 'success',
      idToken: ID_TOKEN,
      authNonce: RAW_NONCE,
      name: 'Amina Cole',
    });
    if (result.status === 'success') {
      expect(result.authNonce).not.toBe(NONCE_HASH);
    }
  });

  it('returns cancelled when the Google sheet is dismissed', async () => {
    google.signIn.mockResolvedValue({ type: 'cancelled', data: null });

    await expect(requestGoogleIdentity()).resolves.toEqual({ status: 'cancelled' });
    expect(google.configure).toHaveBeenCalledTimes(1);
  });

  it('returns play_services_unavailable when Play Services cannot be used', async () => {
    google.checkPlayServices.mockRejectedValue(
      nativeFailure(statusCodes.PLAY_SERVICES_NOT_AVAILABLE),
    );

    await expect(requestGoogleIdentity()).resolves.toEqual({
      status: 'play_services_unavailable',
    });
    expect(google.signIn).not.toHaveBeenCalled();
  });

  it('returns not_configured for a Google developer configuration error', async () => {
    google.signIn.mockRejectedValue(nativeFailure(statusCodes.DEVELOPER_ERROR));

    await expect(requestGoogleIdentity()).resolves.toEqual({ status: 'not_configured' });
  });

  it('returns native_module_unavailable when the Nitro module is missing', async () => {
    google.configure.mockImplementation(() => {
      throw new Error('Cannot find native module NitroGoogleSignin');
    });

    await expect(requestGoogleIdentity()).resolves.toEqual({
      status: 'native_module_unavailable',
    });
    expect(google.signIn).not.toHaveBeenCalled();
  });
});
