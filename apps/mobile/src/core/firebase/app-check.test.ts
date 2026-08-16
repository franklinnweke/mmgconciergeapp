import { describe, expect, it } from 'vitest';

import { getAppCheckProviderConfig } from './app-check-config';

describe('native App Check configuration', () => {
  it('uses debug providers only for development builds', () => {
    expect(getAppCheckProviderConfig(true)).toEqual({
      android: { provider: 'debug' },
      apple: { provider: 'debug' },
    });
  });

  it('uses production attestation providers for release builds', () => {
    expect(getAppCheckProviderConfig(false)).toEqual({
      android: { provider: 'playIntegrity' },
      apple: { provider: 'appAttest' },
    });
  });
});
