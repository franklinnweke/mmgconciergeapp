const baseConfig = require('./app.json').expo;

const firebaseEnvironment = process.env.MMG_FIREBASE_ENV === 'production' ? 'production' : 'development';
const isProduction = firebaseEnvironment === 'production';
const googleServices = isProduction
  ? require('./google-services.json')
  : require('./google-services.dev.json');
const googleWebClientId = googleServices.client
  .flatMap((client) => client.oauth_client ?? [])
  .find((client) => client.client_type === 3)?.client_id;

if (!googleWebClientId) {
  throw new Error(`Missing web OAuth client for ${firebaseEnvironment} Firebase configuration.`);
}

const googleMapsApiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key;
const apnsEnvironment = process.env.MMG_APNS_ENV === 'production' ? 'production' : 'development';
const diagnosticsEnabled = process.env.MMG_DIAGNOSTICS_ENABLED === 'true';
const backgroundModes = Array.isArray(baseConfig.ios?.infoPlist?.UIBackgroundModes)
  ? baseConfig.ios.infoPlist.UIBackgroundModes
  : [];

module.exports = {
  ...baseConfig,
  ios: {
    ...baseConfig.ios,
    googleServicesFile: isProduction ? './GoogleService-Info.plist' : './GoogleService-Info.dev.plist',
    entitlements: {
      ...baseConfig.ios?.entitlements,
      'aps-environment': apnsEnvironment,
    },
    infoPlist: {
      ...baseConfig.ios?.infoPlist,
      UIBackgroundModes: [...new Set([...backgroundModes, 'fetch', 'remote-notification'])],
    },
  },
  android: {
    ...baseConfig.android,
    googleServicesFile: isProduction ? './google-services.json' : './google-services.dev.json',
    config: {
      ...baseConfig.android?.config,
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  extra: {
    ...baseConfig.extra,
    diagnosticsEnabled,
    easBuildCommit: process.env.EAS_BUILD_GIT_COMMIT_HASH || null,
    easBuildProfile: process.env.EAS_BUILD_PROFILE || null,
    firebaseEnvironment,
    googleWebClientId,
  },
};

