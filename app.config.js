const NITRO_GOOGLE_PLUGIN = 'react-native-nitro-google-signin';
const IOS_URL_SCHEME_PREFIX = 'com.googleusercontent.apps.';

function pluginName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function isValidGoogleIosUrlScheme(value) {
  const scheme = String(value || '').trim();
  return scheme.startsWith(IOS_URL_SCHEME_PREFIX) && scheme.length > IOS_URL_SCHEME_PREFIX.length;
}

/**
 * The installed Nitro config plugin writes the iOS URL scheme and CocoaPods.
 * It throws without that scheme or Google services files. Android uses
 * autolinking and an explicit web client ID, so the plugin is added only
 * for a reversed iOS client scheme.
 */
function pluginsForExpo(plugins, iosUrlScheme) {
  const retained = (Array.isArray(plugins) ? plugins : []).filter(
    (entry) => pluginName(entry) !== NITRO_GOOGLE_PLUGIN,
  );
  const scheme = String(iosUrlScheme || '').trim();
  if (!isValidGoogleIosUrlScheme(scheme)) {
    return retained;
  }
  return [...retained, [NITRO_GOOGLE_PLUGIN, { iosUrlScheme: scheme }]];
}

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    usesAppleSignIn: true,
  },
  plugins: pluginsForExpo(config.plugins, process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME),
});

module.exports.pluginsForExpo = pluginsForExpo;
