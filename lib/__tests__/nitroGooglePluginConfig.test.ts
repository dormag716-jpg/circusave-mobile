const { pluginsForExpo } = require('../../app.config');

const NITRO_GOOGLE_PLUGIN = 'react-native-nitro-google-signin';

function names(plugins: unknown[]): string[] {
  return plugins.map((entry) => (Array.isArray(entry) ? String(entry[0]) : String(entry)));
}

describe('Google iOS Expo plugin configuration', () => {
  const existing = [
    'expo-router',
    'expo-secure-store',
    ['expo-notifications', { icon: './assets/images/notification-icon.png' }],
  ];

  test('leaves Android on autolinking when only the web client configuration exists', () => {
    const plugins = pluginsForExpo(existing, undefined);
    expect(plugins).toEqual(existing);
    expect(names(plugins)).not.toContain(NITRO_GOOGLE_PLUGIN);
    expect(JSON.stringify(plugins)).not.toContain('iosUrlScheme');
    expect(JSON.stringify(plugins)).not.toContain('withCircuSaveNitroGoogleSignIn');
  });

  test('adds the real plugin only for a valid reversed iOS client scheme', () => {
    const configured = pluginsForExpo(
      existing,
      '  com.googleusercontent.apps.example-client  ',
    );
    expect(names(configured).slice(0, existing.length)).toEqual(names(existing));
    expect(configured.at(-1)).toEqual([
      NITRO_GOOGLE_PLUGIN,
      { iosUrlScheme: 'com.googleusercontent.apps.example-client' },
    ]);

    expect(pluginsForExpo(existing, '')).toEqual(existing);
    expect(pluginsForExpo(existing, 'com.googleusercontent.apps.')).toEqual(existing);
    expect(pluginsForExpo(existing, 'com.example.app')).toEqual(existing);
  });

  test('replaces duplicate Nitro entries with one configured iOS plugin', () => {
    const duplicated = [
      ...existing,
      NITRO_GOOGLE_PLUGIN,
      [NITRO_GOOGLE_PLUGIN, { iosUrlScheme: 'com.googleusercontent.apps.old' }],
    ];
    const plugins = pluginsForExpo(
      duplicated,
      'com.googleusercontent.apps.example-client',
    );
    expect(names(plugins).filter((name) => name === NITRO_GOOGLE_PLUGIN)).toHaveLength(1);
    expect(plugins.at(-1)).toEqual([
      NITRO_GOOGLE_PLUGIN,
      { iosUrlScheme: 'com.googleusercontent.apps.example-client' },
    ]);
    expect(names(plugins).slice(0, existing.length)).toEqual(names(existing));
  });

  test('does not keep a bare Nitro plugin when the iOS scheme is absent', () => {
    const duplicated = [...existing, NITRO_GOOGLE_PLUGIN];
    const plugins = pluginsForExpo(duplicated, undefined);
    expect(plugins).toEqual(existing);
    expect(names(plugins)).not.toContain(NITRO_GOOGLE_PLUGIN);
  });
});
