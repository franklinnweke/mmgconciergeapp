import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getAdminServerConfig } from './firebase-admin-config';
import { getAdminApp } from './firebase-admin';

describe('getAdminServerConfig (fail-closed environment validation)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    delete process.env.MMG_FIREBASE_ENV;
    delete process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  it('fails closed when FIREBASE_PROJECT_ID is missing or empty', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_PROJECT_ID/
    );

    process.env.FIREBASE_PROJECT_ID = '   ';
    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_PROJECT_ID/
    );
  });

  it('never falls back to NEXT_PUBLIC_FIREBASE_PROJECT_ID for missing server project configuration', () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_PROJECT_ID/
    );
  });

  it('never falls back to production "mmg-concierge" when FIREBASE_PROJECT_ID is missing', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_PROJECT_ID/
    );
  });

  it('fails closed when FIREBASE_STORAGE_BUCKET is missing or empty', () => {
    process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';

    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_STORAGE_BUCKET/
    );

    process.env.FIREBASE_STORAGE_BUCKET = '   ';
    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_STORAGE_BUCKET/
    );
  });

  it('never falls back to NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for missing server bucket configuration', () => {
    process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

    expect(() => getAdminServerConfig()).toThrowError(
      /Missing required server environment variable: FIREBASE_STORAGE_BUCKET/
    );
  });

  it('rejects mismatch between FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID', () => {
    process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge';

    expect(() => getAdminServerConfig()).toThrowError(
      /Firebase project ID mismatch: server FIREBASE_PROJECT_ID is "mmg-concierge-dev" but client NEXT_PUBLIC_FIREBASE_PROJECT_ID is "mmg-concierge"/
    );
  });

  it('rejects mismatch between MMG_FIREBASE_ENV and NEXT_PUBLIC_MMG_FIREBASE_ENV', () => {
    process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';
    process.env.MMG_FIREBASE_ENV = 'development';
    process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV = 'production';

    expect(() => getAdminServerConfig()).toThrowError(
      /Firebase environment mismatch: server MMG_FIREBASE_ENV is "development" but client NEXT_PUBLIC_MMG_FIREBASE_ENV is "production"/
    );
  });

  it('rejects invalid MMG_FIREBASE_ENV value', () => {
    process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
    process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';
    process.env.MMG_FIREBASE_ENV = 'staging';

    expect(() => getAdminServerConfig()).toThrowError(
      /Invalid server MMG_FIREBASE_ENV: expected "development" or "production", got "staging"/
    );
  });

  describe('development environment enforcement', () => {
    beforeEach(() => {
      process.env.MMG_FIREBASE_ENV = 'development';
    });

    it('rejects production project ID "mmg-concierge" during development deployment', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase project ID for development environment: expected "mmg-concierge-dev", got "mmg-concierge"/
      );
    });

    it('rejects unexpected project ID during development deployment', () => {
      process.env.FIREBASE_PROJECT_ID = 'arbitrary-test-project';
      process.env.FIREBASE_STORAGE_BUCKET = 'arbitrary-test-project.firebasestorage.app';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase project ID for development environment: expected "mmg-concierge-dev", got "arbitrary-test-project"/
      );
    });

    it('rejects production storage bucket during development deployment', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge-dev';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase storage bucket for development environment: expected "mmg-concierge-dev.firebasestorage.app", got "mmg-concierge.firebasestorage.app"/
      );
    });

    it('accepts valid development configuration with exact mmg-concierge-dev target', () => {
      process.env.FIREBASE_PROJECT_ID = '  mmg-concierge-dev  ';
      process.env.FIREBASE_STORAGE_BUCKET = '  mmg-concierge-dev.firebasestorage.app  ';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
      process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV = 'development';

      const config = getAdminServerConfig();
      expect(config).toEqual({
        projectId: 'mmg-concierge-dev',
        storageBucket: 'mmg-concierge-dev.firebasestorage.app',
        environment: 'development',
      });
    });
  });

  describe('production environment enforcement (symmetric allowlist without escape hatch)', () => {
    beforeEach(() => {
      process.env.MMG_FIREBASE_ENV = 'production';
    });

    it('rejects development project ID "mmg-concierge-dev" in production environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase project ID for production environment: expected "mmg-concierge", got "mmg-concierge-dev"/
      );
    });

    it('rejects arbitrary project ID in production environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'arbitrary-corp-project';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase project ID for production environment: expected "mmg-concierge", got "arbitrary-corp-project"/
      );
    });

    it('rejects development storage bucket in production environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "mmg-concierge-dev.firebasestorage.app"/
      );
    });

    it('rejects arbitrary storage bucket in production environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge';
      process.env.FIREBASE_STORAGE_BUCKET = 'arbitrary-bucket.firebasestorage.app';

      expect(() => getAdminServerConfig()).toThrowError(
        /Invalid server Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "arbitrary-bucket.firebasestorage.app"/
      );
    });

    it('accepts exact production configuration when authorized', () => {
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge.firebasestorage.app';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge';
      process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV = 'production';

      const config = getAdminServerConfig();
      expect(config).toEqual({
        projectId: 'mmg-concierge',
        storageBucket: 'mmg-concierge.firebasestorage.app',
        environment: 'production',
      });
    });
  });

  describe('service-account environment credentials', () => {
    beforeEach(() => {
      process.env.MMG_FIREBASE_ENV = 'development';
      process.env.FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
      process.env.FIREBASE_STORAGE_BUCKET = 'mmg-concierge-dev.firebasestorage.app';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mmg-concierge-dev';
      process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV = 'development';
    });

    it('rejects when FIREBASE_CLIENT_EMAIL is provided without FIREBASE_PRIVATE_KEY', () => {
      process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk@mmg-concierge-dev.iam.gserviceaccount.com';

      expect(() => getAdminServerConfig()).toThrowError(
        /Both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be provided together/
      );
    });

    it('rejects when FIREBASE_PRIVATE_KEY is provided without FIREBASE_CLIENT_EMAIL', () => {
      process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n';

      expect(() => getAdminServerConfig()).toThrowError(
        /Both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be provided together/
      );
    });

    it('correctly parses clientEmail and unescapes \\n in privateKey', () => {
      process.env.FIREBASE_CLIENT_EMAIL = '  firebase-adminsdk@mmg-concierge-dev.iam.gserviceaccount.com  ';
      process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBg\\n-----END PRIVATE KEY-----';

      const config = getAdminServerConfig();
      expect(config.clientEmail).toBe('firebase-adminsdk@mmg-concierge-dev.iam.gserviceaccount.com');
      expect(config.privateKey).toBe('-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg\n-----END PRIVATE KEY-----');
    });
  });

  it('lazily validates configuration upon getAdminApp invocation rather than module import', () => {
    expect(() => getAdminApp()).toThrowError(
      /Missing required server environment variable: FIREBASE_PROJECT_ID/
    );
  });
});
