module.exports = ({ config }) => {
  const iosUrlScheme = String(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || '').trim();
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  if (iosUrlScheme.startsWith('com.googleusercontent.apps.')) {
    plugins.push([
      'react-native-nitro-google-signin',
      { iosUrlScheme },
    ]);
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
    },
    plugins,
  };
};
