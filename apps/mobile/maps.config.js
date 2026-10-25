/** Platform-restricted native SDK keys, separate from the server Places key. */
function mapsConfiguration(environment, env, androidFallback) {
  const suffix = environment === 'production' ? 'PROD' : 'DEV';
  const iosKey = env[`MMG_GOOGLE_MAPS_IOS_API_KEY_${suffix}`]?.trim();
  const androidKey = env[`MMG_GOOGLE_MAPS_ANDROID_API_KEY_${suffix}`]?.trim() || androidFallback;
  if (env.EAS_BUILD_PLATFORM === 'ios' && !iosKey) {
    throw new Error(`Missing MMG_GOOGLE_MAPS_IOS_API_KEY_${suffix}. Configure an iOS-restricted Maps SDK key before creating an iOS build.`);
  }
  return {
    plugin: ['react-native-maps', {
      ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
      ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
    }],
    googleMapsIosConfigured: Boolean(iosKey),
  };
}

module.exports = { mapsConfiguration };
