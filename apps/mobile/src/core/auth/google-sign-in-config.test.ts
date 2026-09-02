import { describe, expect, it } from 'vitest';

import { readGoogleWebClientId } from './google-sign-in-config';

describe('Google Sign-In configuration', () => {
  it('uses the web OAuth client embedded by the selected Firebase build environment', () => {
    expect(readGoogleWebClientId({
      googleWebClientId: '133019251795-3idjttf0demotpdlqc6eeffumkdt8d8n.apps.googleusercontent.com',
    })).toBe('133019251795-3idjttf0demotpdlqc6eeffumkdt8d8n.apps.googleusercontent.com');
  });

  it('fails closed when a build omits or corrupts the OAuth client', () => {
    expect(() => readGoogleWebClientId({})).toThrow('not configured');
    expect(() => readGoogleWebClientId({ googleWebClientId: 'wrong-project' })).toThrow(
      'not configured',
    );
  });
});
