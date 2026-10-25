import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const { mapsConfiguration } = createRequire(import.meta.url)('../apps/mobile/maps.config.js');

describe('native Google Maps configuration', () => {
  it('does not borrow a production key for a development build', () => {
    expect(mapsConfiguration('development', { MMG_GOOGLE_MAPS_IOS_API_KEY_PROD: 'production-key' }, 'android-key'))
      .toMatchObject({ googleMapsIosConfigured: false });
  });
  it('passes configured SDK keys to the native plugin, not a Places server key', () => {
    expect(mapsConfiguration('development', { MMG_GOOGLE_MAPS_IOS_API_KEY_DEV: 'ios-sdk-key' }, 'android-sdk-key'))
      .toEqual({ googleMapsIosConfigured: true, plugin: ['react-native-maps', { iosGoogleMapsApiKey: 'ios-sdk-key', androidGoogleMapsApiKey: 'android-sdk-key' }] });
  });
  it('blocks an iOS release build when its SDK key is absent', () => {
    expect(() => mapsConfiguration('development', { EAS_BUILD_PLATFORM: 'ios' }, '')).toThrow('MMG_GOOGLE_MAPS_IOS_API_KEY_DEV');
  });
});
