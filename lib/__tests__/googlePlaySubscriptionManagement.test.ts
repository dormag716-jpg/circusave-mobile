const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: mockCanOpenURL,
    openURL: mockOpenURL,
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: 'com.circusave.mobile' },
    },
  },
}));

import {
  buildGooglePlaySubscriptionManagementUrl,
  getAndroidApplicationPackage,
  GooglePlaySubscriptionManagementError,
  openGooglePlaySubscriptionManagement,
} from '../googlePlaySubscriptionManagement';

describe('Google Play subscription management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);
  });

  test('builds the validated package and exact product destination', () => {
    const url = new URL(
      buildGooglePlaySubscriptionManagementUrl(
        'com.circusave.mobile',
        'organizer-pro',
      ),
    );

    expect(url.origin).toBe('https://play.google.com');
    expect(url.pathname).toBe('/store/account/subscriptions');
    expect(url.searchParams.get('package')).toBe('com.circusave.mobile');
    expect(url.searchParams.get('sku')).toBe('organizer-pro');
  });

  test('supports package-only management without adding other identifiers', () => {
    const url = new URL(
      buildGooglePlaySubscriptionManagementUrl('com.circusave.mobile'),
    );

    expect([...url.searchParams.keys()]).toEqual(['package']);
    expect(url.search).not.toMatch(/token|secret|internal|user/i);
  });

  test.each([
    ['invalid package', 'not a package', null],
    ['invalid product', 'com.circusave.mobile', 'product?token=secret'],
  ])('%s fails with sanitized error', (_label, packageName, productId) => {
    expect(() =>
      buildGooglePlaySubscriptionManagementUrl(packageName, productId),
    ).toThrow(GooglePlaySubscriptionManagementError);
  });

  test('opens only a supported validated destination', async () => {
    await openGooglePlaySubscriptionManagement(
      'com.circusave.mobile',
      'organizer-pro',
    );

    expect(mockCanOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith(
      mockCanOpenURL.mock.calls[0][0],
    );
  });

  test('fails safely when the destination cannot be opened', async () => {
    mockCanOpenURL.mockResolvedValue(false);

    await expect(
      openGooglePlaySubscriptionManagement('com.circusave.mobile'),
    ).rejects.toEqual(new GooglePlaySubscriptionManagementError());
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  test('reads the configured Android package without hardcoding it in UI code', () => {
    expect(getAndroidApplicationPackage()).toBe('com.circusave.mobile');
  });
});
