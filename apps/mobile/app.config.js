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

module.exports = {
  ...baseConfig,
  ios: {
    ...baseConfig.ios,
    googleServicesFile: isProduction ? './GoogleService-Info.plist' : './GoogleService-Info.dev.plist',
  },
  android: {
    ...baseConfig.android,
    googleServicesFile: isProduction ? './google-services.json' : './google-services.dev.json',
  },
  extra: {
    ...baseConfig.extra,
    firebaseEnvironment,
    googleWebClientId,
  },
};
