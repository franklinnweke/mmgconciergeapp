import { describe, expect, it } from 'vitest';

import { readPlistString, updateGoogleUrlSchemes } from './select-firebase-config.mjs';

const firebasePlist = `
<key>REVERSED_CLIENT_ID</key>
<string>com.googleusercontent.apps.133019251795-ios-client</string>
<key>GOOGLE_APP_ID</key>
<string>1:133019251795:ios:development-app</string>
`;

describe('native Firebase environment selection', () => {
  it('reads required Firebase plist values', () => {
    expect(readPlistString(firebasePlist, 'REVERSED_CLIENT_ID')).toBe(
      'com.googleusercontent.apps.133019251795-ios-client',
    );
  });

  it('replaces both Google callback schemes with the selected environment', () => {
    const result = updateGoogleUrlSchemes(`
      <string>com.googleusercontent.apps.78068107398-production</string>
      <string>app-1-78068107398-ios-production-app</string>
    `, firebasePlist);

    expect(result).toContain('com.googleusercontent.apps.133019251795-ios-client');
    expect(result).toContain('app-1-133019251795-ios-development-app');
    expect(result).not.toContain('78068107398');
  });

  it('fails closed when required values or replaceable schemes are absent', () => {
    expect(() => readPlistString('', 'GOOGLE_APP_ID')).toThrow('Missing GOOGLE_APP_ID');
    expect(() => updateGoogleUrlSchemes('<plist />', firebasePlist)).toThrow(
      'were not updated',
    );
  });
});
