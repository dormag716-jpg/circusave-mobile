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

const fs = require('fs');
const path = require('path');

const ANDROID_PACKAGE = 'com.circusave.mobile';
const DEFAULT_GOOGLE_SERVICES_FILE = './google-services.json';

/**
 * Android push (FCM) needs the Firebase google-services.json packaged in the
 * app. Returns the path to hand to `android.googleServicesFile`, or undefined
 * when there is no file, so builds without it behave exactly as before.
 *
 * Path: GOOGLE_SERVICES_JSON when set (an EAS file variable), otherwise
 * ./google-services.json at the project root. A file that does not contain an
 * Android client for this app's package fails the build early with a clear
 * message instead of a Gradle error later.
 */
function googleServicesFileFor({ envPath, projectRoot, exists, readText }) {
  const candidate = String(envPath || '').trim() || DEFAULT_GOOGLE_SERVICES_FILE;
  const resolved = path.isAbsolute(candidate)
    ? candidate
    : path.join(projectRoot || process.cwd(), candidate);
  if (!exists(resolved)) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(readText(resolved));
  } catch {
    throw new Error(`google-services.json at ${candidate} is not valid JSON.`);
  }
  const clients = Array.isArray(parsed && parsed.client) ? parsed.client : [];
  const matches = clients.some(
    (client) =>
      client &&
      client.client_info &&
      client.client_info.android_client_info &&
      client.client_info.android_client_info.package_name === ANDROID_PACKAGE,
  );
  if (!matches) {
    throw new Error(
      `google-services.json at ${candidate} has no Android client for ${ANDROID_PACKAGE}. ` +
        'Download it from the Firebase Android app registered for that package.',
    );
  }
  return candidate;
}

module.exports = ({ config, projectRoot }) => {
  const googleServicesFile = googleServicesFileFor({
    envPath: process.env.GOOGLE_SERVICES_JSON,
    projectRoot,
    exists: fs.existsSync,
    readText: (file) => fs.readFileSync(file, 'utf8'),
  });
  return {
    ...config,
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
    },
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: pluginsForExpo(config.plugins, process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME),
  };
};

module.exports.pluginsForExpo = pluginsForExpo;
module.exports.googleServicesFileFor = googleServicesFileFor;
