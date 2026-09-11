import { beforeEach, describe, expect, it } from 'vitest';

import { getClientFirebaseConfig } from './firebase-client-config';
import { getClientApp } from './firebase-client';

describe('getClientFirebaseConfig (fail-closed client environment validation)', () => {
  const originalEnv = process.env;

  const validDevClientEnv = {
    NEXT_PUBLIC_MMG_FIREBASE_ENV: 'development',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'valid-dev-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'mmg-concierge-dev.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'mmg-concierge-dev',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'mmg-concierge-dev.firebasestorage.app',
  };

  const validProdClientEnv = {
    NEXT_PUBLIC_MMG_FIREBASE_ENV: 'production',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'valid-prod-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'mmg-concierge.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'mmg-concierge',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'mmg-concierge.firebasestorage.app',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV;
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.MMG_FIREBASE_ENV;
  });

  it('fails closed when NEXT_PUBLIC_FIREBASE_API_KEY is missing, empty, or mock', () => {
    Object.assign(process.env, validDevClientEnv);

    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing or invalid required client environment variable: NEXT_PUBLIC_FIREBASE_API_KEY/
    );

    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = '   ';
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing or invalid required client environment variable: NEXT_PUBLIC_FIREBASE_API_KEY/
    );

    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'mock-api-key';
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing or invalid required client environment variable: NEXT_PUBLIC_FIREBASE_API_KEY/
    );
  });

  it('fails closed when NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is missing or empty', () => {
    Object.assign(process.env, validDevClientEnv);

    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN/
    );

    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = '   ';
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN/
    );
  });

  it('fails closed when NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing or empty', () => {
    Object.assign(process.env, validDevClientEnv);

    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID/
    );

    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = '   ';
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID/
    );
  });

  it('fails closed when NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing or empty', () => {
    Object.assign(process.env, validDevClientEnv);

    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET/
    );

    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = '   ';
    expect(() => getClientFirebaseConfig()).toThrowError(
      /Missing required client environment variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET/
    );
  });

  it('fails closed when NEXT_PUBLIC_MMG_FIREBASE_ENV is an invalid string', () => {
    Object.assign(process.env, validDevClientEnv);
    process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV = 'staging';

    expect(() => getClientFirebaseConfig()).toThrowError(
      /Invalid client NEXT_PUBLIC_MMG_FIREBASE_ENV: expected "development" or "production", got "staging"/
    );
  });

  it('does not inspect private server variables MMG_FIREBASE_ENV or FIREBASE_PROJECT_ID', () => {
    Object.assign(process.env, validDevClientEnv);
    // Even if private server variables are conflicting, client relies strictly on NEXT_PUBLIC_*
    process.env.MMG_FIREBASE_ENV = 'production';
    process.env.FIREBASE_PROJECT_ID = 'production-project';

    const config = getClientFirebaseConfig();
    expect(config.projectId).toBe('mmg-concierge-dev');
    expect(config.environment).toBe('development');
  });

  describe('development environment enforcement', () => {
    beforeEach(() => {
      Object.assign(process.env, validDevClientEnv);
    });

    it('rejects production project ID "mmg-concierge" during development deployment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase project ID for development environment: expected "mmg-concierge-dev", got "mmg-concierge"/
      );
    });

    it('rejects unexpected project ID during development deployment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'arbitrary-test-project';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase project ID for development environment: expected "mmg-concierge-dev", got "arbitrary-test-project"/
      );
    });

    it('rejects production auth domain during development deployment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'mmg-concierge.firebaseapp.com';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase auth domain for development environment: expected "mmg-concierge-dev.firebaseapp.com", got "mmg-concierge.firebaseapp.com"/
      );
    });

    it('rejects production storage bucket during development deployment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase storage bucket for development environment: expected "mmg-concierge-dev.firebasestorage.app", got "mmg-concierge.firebasestorage.app"/
      );
    });

    it('accepts valid development configuration with exact mmg-concierge-dev values', () => {
      const config = getClientFirebaseConfig();
      expect(config).toEqual({
        apiKey: 'valid-dev-api-key',
        authDomain: 'mmg-concierge-dev.firebaseapp.com',
        projectId: 'mmg-concierge-dev',
        storageBucket: 'mmg-concierge-dev.firebasestorage.app',
        environment: 'development',
      });
    });
  });

  describe('production environment enforcement (symmetric allowlist without escape hatch)', () => {
    beforeEach(() => {
      Object.assign(process.env, validProdClientEnv);
    });

    it('rejects development project ID "mmg-concierge-dev" in production environment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge-dev';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase project ID for production environment: expected "mmg-concierge", got "mmg-concierge-dev"/
      );
    });

    it('rejects arbitrary project ID in production environment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'arbitrary-corp-project';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase project ID for production environment: expected "mmg-concierge", got "arbitrary-corp-project"/
      );
    });

    it('rejects development auth domain in production environment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'mmg-concierge-dev.firebaseapp.com';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase auth domain for production environment: expected "mmg-concierge.firebaseapp.com", got "mmg-concierge-dev.firebaseapp.com"/
      );
    });

    it('rejects development storage bucket in production environment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "mmg-concierge-dev.firebasestorage.app"/
      );
    });

    it('rejects arbitrary storage bucket in production environment', () => {
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'arbitrary-bucket.firebasestorage.app';

      expect(() => getClientFirebaseConfig()).toThrowError(
        /Invalid client Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "arbitrary-bucket.firebasestorage.app"/
      );
    });

    it('accepts exact production configuration when authorized', () => {
      const config = getClientFirebaseConfig();
      expect(config).toEqual({
        apiKey: 'valid-prod-api-key',
        authDomain: 'mmg-concierge.firebaseapp.com',
        projectId: 'mmg-concierge',
        storageBucket: 'mmg-concierge.firebasestorage.app',
        environment: 'production',
      });
    });
  });

  it('lazily validates configuration upon getClientApp invocation rather than module import', () => {
    expect(() => getClientApp()).toThrowError(
      /Missing or invalid required client environment variable: NEXT_PUBLIC_FIREBASE_API_KEY/
    );
  });
});
