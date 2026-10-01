import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { statusCodes } from 'react-native-nitro-google-signin';

const officialStatusCodes = createRequire(__filename)(
  path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    'react-native-nitro-google-signin',
    'lib',
    'commonjs',
    'types.js',
  ),
).statusCodes as typeof statusCodes;

import { ApiError } from '../platform/networkErrors';
import {
  classifyFederatedSubmitError,
  classifyGoogleNativeError,
  googleSignInMessageKey,
} from '../auth/googleSignInOutcome';

const root = path.join(__dirname, '..', '..');

function nativeError(code: string): { code: string; message: string } {
  return { code, message: 'native-detail-not-for-users' };
}

describe('Google sign-in outcomes', () => {
  test('uses the installed package status codes', () => {
    expect(statusCodes).toBe(officialStatusCodes);
  });

  const cases = [
    ['cancelled', nativeError(statusCodes.SIGN_IN_CANCELLED), null],
    ['in_progress', nativeError(statusCodes.IN_PROGRESS), 'federated.inProgressTitle'],
    [
      'play_services_unavailable',
      nativeError(statusCodes.PLAY_SERVICES_NOT_AVAILABLE),
      'federated.playServicesTitle',
    ],
    ['not_configured', nativeError(statusCodes.DEVELOPER_ERROR), 'federated.notConfiguredTitle'],
    ['unknown', nativeError(statusCodes.ONE_TAP_START_FAILED), 'federated.unknownTitle'],
    ['unknown', nativeError(statusCodes.SIGN_IN_REQUIRED), 'federated.unknownTitle'],
    [
      'native_module_unavailable',
      new Error('Cannot find native module NitroGoogleSignin'),
      'federated.unavailableTitle',
    ],
    ['unknown', new Error('something else failed'), 'federated.unknownTitle'],
  ] as const;

  test.each(cases)('%s uses a safe message', (status, error, titleKey) => {
    expect(classifyGoogleNativeError(error)).toBe(status);
    const message = googleSignInMessageKey(status);
    if (titleKey == null) {
      expect(message).toBeNull();
      return;
    }
    expect(message?.title).toBe(titleKey);
    if (status !== 'native_module_unavailable') {
      expect(message?.title).not.toBe('federated.unavailableTitle');
    }
  });

  test('missing configuration, nonce failure, network, and backend each have their own message', () => {
    expect(googleSignInMessageKey('not_configured')?.title).toBe('federated.notConfiguredTitle');
    expect(googleSignInMessageKey('nonce_unavailable')?.title).toBe('federated.nonceTitle');
    expect(googleSignInMessageKey('network_failure')?.title).toBe('federated.networkTitle');
    expect(googleSignInMessageKey('backend_failure')?.title).toBe('federated.backendTitle');
    expect(googleSignInMessageKey('native_module_unavailable')?.title).toBe(
      'federated.unavailableTitle',
    );
    expect(classifyFederatedSubmitError(new ApiError('rejected', 401))).toBe('backend_failure');
    expect(classifyFederatedSubmitError(new ApiError('down', 503))).toBe('network_failure');
    expect(classifyFederatedSubmitError(new Error('Network request failed'))).toBe(
      'network_failure',
    );
  });

  test('English copy does not call every failure a new build', () => {
    const catalog = JSON.parse(
      readFileSync(path.join(root, 'lib', 'i18n', 'locales', 'en', 'auth.json'), 'utf8'),
    ) as { federated: Record<string, string> };
    const source = readFileSync(path.join(root, 'lib', 'auth', 'googleSignInOutcome.ts'), 'utf8');
    expect(source).toContain("from 'react-native-nitro-google-signin'");
    expect(source).toContain('isErrorWithCode');
    expect(source).not.toContain('GOOGLE_STATUS_CODES');
    expect(catalog.federated.unavailableTitle).toBe('A new app build is required');
    expect(catalog.federated.notConfiguredBody).not.toContain('native-detail-not-for-users');
    expect(catalog.federated.unknownBody).not.toContain('native-detail-not-for-users');
    expect(catalog.federated.playServicesTitle).not.toBe(catalog.federated.unavailableTitle);
    expect(catalog.federated.notConfiguredTitle).not.toBe(catalog.federated.unavailableTitle);
    expect(catalog.federated.networkTitle).not.toBe(catalog.federated.unavailableTitle);
    expect(catalog.federated.backendTitle).not.toBe(catalog.federated.unavailableTitle);
    for (const language of ['en', 'es', 'ht']) {
      const locale = JSON.parse(
        readFileSync(path.join(root, 'lib', 'i18n', 'locales', language, 'auth.json'), 'utf8'),
      ) as { federated: Record<string, string> };
      for (const key of [
        'playServicesTitle',
        'nonceTitle',
        'networkTitle',
        'backendTitle',
        'unknownTitle',
        'inProgressTitle',
      ]) {
        expect(locale.federated[key]?.length).toBeGreaterThan(0);
      }
    }
  });
});
