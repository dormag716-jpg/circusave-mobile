import { existsSync, readFileSync } from 'fs';
import path from 'path';

import { APP_SCHEME } from '../config';
import { postAuthHrefFromUrl } from '../navigation';

jest.mock('expo-linking', () => ({
  parse: (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, '');
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      hostname: parsed.hostname,
      path,
      queryParams: Object.fromEntries(parsed.searchParams.entries()),
    };
  },
}));

const root = path.join(__dirname, '..', '..');

describe('Android production build configuration', () => {
  const appConfig = JSON.parse(
    readFileSync(path.join(root, 'app.json'), 'utf8'),
  ) as {
    expo: {
      name: string;
      scheme: string;
      splash: { image: string; backgroundColor: string };
      android: {
        package: string;
        allowBackup?: boolean;
        permissions?: string[];
        blockedPermissions?: string[];
        intentFilters?: Array<{
          autoVerify?: boolean;
          data?: Array<{ scheme?: string; host?: string; pathPrefix?: string }>;
        }>;
        adaptiveIcon: { foregroundImage: string; backgroundColor: string };
      };
      plugins: unknown[];
    };
  };
  const easConfig = JSON.parse(
    readFileSync(path.join(root, 'eas.json'), 'utf8'),
  ) as {
    cli: { appVersionSource: string };
    build: {
      production: {
        environment: string;
        distribution?: string;
        credentialsSource?: string;
        autoIncrement?: boolean;
        android?: { buildType?: string };
      };
    };
    submit: { production: { android?: { track?: string; releaseStatus?: string } } };
  };

  test('package, name, and scheme match CircuSave Android production identity', () => {
    expect(appConfig.expo.name).toBe('CircuSave');
    expect(appConfig.expo.android.package).toBe('com.circusave.mobile');
    expect(appConfig.expo.scheme).toBe(APP_SCHEME);
    expect(APP_SCHEME).toBe('circusavemobile');
  });

  test('production EAS profile is a remotely signed store app bundle', () => {
    expect(easConfig.cli.appVersionSource).toBe('remote');
    expect(easConfig.build.production.environment).toBe('production');
    expect(easConfig.build.production.autoIncrement).toBe(true);
    expect(easConfig.build.production.distribution).toBe('store');
    expect(easConfig.build.production.credentialsSource).toBe('remote');
    expect(easConfig.build.production.android?.buildType).toBe('app-bundle');
    expect(easConfig.submit.production.android?.track).toBe('internal');
    expect(easConfig.submit.production.android?.releaseStatus).toBe('draft');
  });

  test('Stripe provider, package, and contribution payment config are absent', () => {
    const configSource = readFileSync(path.join(root, 'lib', 'config.ts'), 'utf8');
    const paymentSource = readFileSync(
      path.join(root, 'lib', 'stripeContributionPayment.ts'),
      'utf8',
    );
    const layoutSource = readFileSync(
      path.join(root, 'app', '_layout.tsx'),
      'utf8',
    );
    const packageSource = readFileSync(path.join(root, 'package.json'), 'utf8');
    const contributionSource = readFileSync(
      path.join(root, 'app', 'payment', 'contribution.tsx'),
      'utf8',
    );
    expect(configSource).not.toContain('STRIPE_RETURN_URL');
    expect(configSource).not.toContain('STRIPE_MERCHANT_IDENTIFIER');
    expect(configSource).not.toContain('resolveStripePublishableKey');
    expect(configSource).not.toContain('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    expect(paymentSource).not.toContain('STRIPE_RETURN_URL');
    expect(paymentSource).not.toContain('runStripeContributionPayment');
    expect(layoutSource).not.toContain('StripeProvider');
    expect(layoutSource).not.toContain('STRIPE_MERCHANT_IDENTIFIER');
    expect(layoutSource).not.toContain('@stripe/stripe-react-native');
    expect(packageSource).not.toContain('@stripe/stripe-react-native');
    expect(contributionSource).not.toContain('@stripe/stripe-react-native');
    expect(contributionSource).not.toContain('createPaymentIntent');
  });

  test('Google Play Organizer Pro billing remains configured', () => {
    const packageSource = readFileSync(path.join(root, 'package.json'), 'utf8');
    const appConfigPlugins = JSON.stringify(appConfig.expo.plugins);
    expect(packageSource).toContain('"expo-iap"');
    expect(appConfigPlugins).toContain('expo-iap');
  });

  test('HTTPS invite App Links are declared for circusave.com', () => {
    const inviteFilter = appConfig.expo.android.intentFilters?.find((filter) =>
      filter.data?.some(
        (entry) =>
          entry.scheme === 'https' &&
          entry.host === 'circusave.com' &&
          entry.pathPrefix === '/invite',
      ),
    );
    expect(inviteFilter?.autoVerify).toBe(true);
    expect(
      inviteFilter?.data?.some(
        (entry) => entry.host === 'www.circusave.com' && entry.pathPrefix === '/invite',
      ),
    ).toBe(true);
  });

  test('HTTPS and custom-scheme invite links resolve to the claim screen', () => {
    expect(
      postAuthHrefFromUrl(
        'https://circusave.com/invite/circle-1?claimToken=claim-token',
      ),
    ).toEqual({
      pathname: '/invite/[id]',
      params: { id: 'circle-1', claimToken: 'claim-token' },
    });
    expect(
      postAuthHrefFromUrl('circusavemobile://invite/circle-1?claimToken=claim-token'),
    ).toEqual({
      pathname: '/invite/[id]',
      params: { id: 'circle-1', claimToken: 'claim-token' },
    });
  });

  test('Android backup is disabled and overlay permission is blocked', () => {
    expect(appConfig.expo.android.allowBackup).toBe(false);
    expect(appConfig.expo.android.blockedPermissions).toContain(
      'android.permission.SYSTEM_ALERT_WINDOW',
    );
    expect(appConfig.expo.android.permissions).toContain(
      'android.permission.POST_NOTIFICATIONS',
    );
  });

  test('notification plugin and CircuSave splash/adaptive assets are present', () => {
    const notificationsPlugin = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    ) as [string, { icon?: string; color?: string; defaultChannel?: string }];
    expect(notificationsPlugin[1].icon).toBe(
      './assets/images/notification-icon.png',
    );
    expect(
      existsSync(path.join(root, 'assets', 'images', 'notification-icon.png')),
    ).toBe(true);
    expect(existsSync(path.join(root, appConfig.expo.splash.image))).toBe(true);
    expect(
      existsSync(path.join(root, appConfig.expo.android.adaptiveIcon.foregroundImage)),
    ).toBe(true);
    expect(appConfig.expo.splash.backgroundColor).toBe('#F8FAFC');

    const splash = readFileSync(path.join(root, appConfig.expo.splash.image));
    expect(splash.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
