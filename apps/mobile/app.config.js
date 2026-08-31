const baseConfig = require('./app.json').expo;

const firebaseEnvironment = process.env.MMG_FIREBASE_ENV === 'production' ? 'production' : 'development';
const isProduction = firebaseEnvironment === 'production';

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
  },
};
