import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDiagnosticState,
  formatDiagnosticReport,
  getBuildInfo,
  getDiagnosticSnapshot,
  isDiagnosticModeEnabled,
  recordAuthPhase,
  recordBreadcrumb,
  recordNavigation,
  sanitizeDiagnosticText,
  setDiagnosticExpoConfigForTesting,
} from './diagnostic-tracker';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        firebaseEnvironment: 'development',
      },
      ios: {
        buildNumber: '37',
      },
      version: '1.0.0',
    },
  },
}));

describe('diagnostic-tracker', () => {
  beforeEach(() => {
    clearDiagnosticState();
  });

  describe('state tracking', () => {
    it('records navigation updates and adds breadcrumb', () => {
      recordNavigation('/(owner)', ['(owner)', 'index']);
      const snapshot = getDiagnosticSnapshot();

      expect(snapshot.currentRoute).toBe('/(owner)');
      expect(snapshot.segments).toEqual(['(owner)', 'index']);
      expect(snapshot.breadcrumbs).toHaveLength(1);
      expect(snapshot.breadcrumbs[0].category).toBe('nav');
      expect(snapshot.breadcrumbs[0].message).toBe('route: /(owner)');
    });

    it('records auth phase updates and adds breadcrumb', () => {
      recordAuthPhase('signing_out');
      const snapshot = getDiagnosticSnapshot();

      expect(snapshot.authPhase).toBe('signing_out');
      expect(snapshot.breadcrumbs).toHaveLength(1);
      expect(snapshot.breadcrumbs[0].category).toBe('auth');
      expect(snapshot.breadcrumbs[0].message).toBe('phase: signing_out');
    });

    it('caps breadcrumb buffer to 30 entries without unbounded growth', () => {
      for (let i = 0; i < 35; i++) {
        recordBreadcrumb('test', `event_${i}`);
      }

      const snapshot = getDiagnosticSnapshot();
      expect(snapshot.breadcrumbs).toHaveLength(30);
      expect(snapshot.breadcrumbs[0].message).toBe('event_5');
      expect(snapshot.breadcrumbs[29].message).toBe('event_34');
    });
  });

  describe('sanitization', () => {
    it('redacts email addresses', () => {
      const input = 'Error encountered for user test.owner@example.com during request';
      expect(sanitizeDiagnosticText(input)).toBe(
        'Error encountered for user [REDACTED_EMAIL] during request',
      );
    });

    it('redacts Nigerian phone numbers in local and international formats', () => {
      expect(sanitizeDiagnosticText('Phone 08012345678 verified')).toBe('Phone [REDACTED_PHONE] verified');
      expect(sanitizeDiagnosticText('Phone +2348012345678 verified')).toBe('Phone [REDACTED_PHONE] verified');
      expect(sanitizeDiagnosticText('Phone 09098765432 verified')).toBe('Phone [REDACTED_PHONE] verified');
    });

    it('redacts Bearer tokens and JWT shapes', () => {
      const input = 'Authorization failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis';
      const sanitized = sanitizeDiagnosticText(input);
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('redacts Firestore document paths', () => {
      expect(sanitizeDiagnosticText('Permission denied at users/usr_1234567890/settings')).toBe(
        'Permission denied at users/[REDACTED_ID]/settings',
      );
      expect(sanitizeDiagnosticText('Failed loading renterProfiles/renter_abc123456')).toBe(
        'Failed loading renterProfiles/[REDACTED_ID]',
      );
      expect(sanitizeDiagnosticText('Failed loading ownerProfiles/own_xyz789012')).toBe(
        'Failed loading ownerProfiles/[REDACTED_ID]',
      );
    });

    it('redacts explicit uid, userId, renterId, and ownerId key-value patterns', () => {
      expect(sanitizeDiagnosticText('Query failed: uid=user_1234567890')).toBe(
        'Query failed: uid=[REDACTED_ID]',
      );
      expect(sanitizeDiagnosticText('Context: userId: "user_1234567890"')).toBe(
        'Context: userId: [REDACTED_ID]',
      );
      expect(sanitizeDiagnosticText('Request renterId = \'renter_998877\'')).toBe(
        'Request renterId = [REDACTED_ID]',
      );
      expect(sanitizeDiagnosticText('Assigned ownerId: owner_554433')).toBe(
        'Assigned ownerId: [REDACTED_ID]',
      );
    });

    it('preserves null and undefined scalar states for uid/userId', () => {
      expect(sanitizeDiagnosticText('Active session uid: null')).toBe('Active session uid: null');
      expect(sanitizeDiagnosticText('Current userId: undefined')).toBe('Current userId: undefined');
    });

    it('redacts sensitive keys including uid and userId in breadcrumb data payload', () => {
      recordBreadcrumb('ui', 'submit_form', {
        email: 'private@mmg.com',
        ownerId: 'owner_123',
        phoneNumber: '+2348012345678',
        safeKey: 'active_step',
        uid: 'user_456',
        userId: 'user_789',
      });

      const snapshot = getDiagnosticSnapshot();
      const data = snapshot.breadcrumbs[0].data;
      expect(data).toBeDefined();
      expect(data?.email).toBe('[REDACTED]');
      expect(data?.phoneNumber).toBe('[REDACTED]');
      expect(data?.uid).toBe('[REDACTED]');
      expect(data?.userId).toBe('[REDACTED]');
      expect(data?.ownerId).toBe('[REDACTED]');
      expect(data?.safeKey).toBe('active_step');
    });
  });

  describe('isDiagnosticModeEnabled', () => {
    it('returns false when firebaseEnvironment is production even if diagnosticsEnabled is true or __DEV__ is true', () => {
      const originalDev = (globalThis as unknown as { __DEV__?: boolean }).__DEV__;
      try {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = true;
        setDiagnosticExpoConfigForTesting({
          extra: { diagnosticsEnabled: true, firebaseEnvironment: 'production' },
        });

        expect(isDiagnosticModeEnabled()).toBe(false);
      } finally {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = originalDev;
      }
    });

    it('returns true when in __DEV__ and non-production', () => {
      const originalDev = (globalThis as unknown as { __DEV__?: boolean }).__DEV__;
      try {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = true;
        setDiagnosticExpoConfigForTesting({
          extra: { firebaseEnvironment: 'development' },
        });

        expect(isDiagnosticModeEnabled()).toBe(true);
      } finally {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = originalDev;
      }
    });

    it('in non-__DEV__ builds, requires explicit diagnosticsEnabled flag', () => {
      const originalDev = (globalThis as unknown as { __DEV__?: boolean }).__DEV__;
      try {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = false;

        // Without flag: false
        setDiagnosticExpoConfigForTesting({
          extra: { firebaseEnvironment: 'development' },
        });
        expect(isDiagnosticModeEnabled()).toBe(false);

        // With flag false: false
        setDiagnosticExpoConfigForTesting({
          extra: { diagnosticsEnabled: false, firebaseEnvironment: 'development' },
        });
        expect(isDiagnosticModeEnabled()).toBe(false);

        // With flag true: true
        setDiagnosticExpoConfigForTesting({
          extra: { diagnosticsEnabled: true, firebaseEnvironment: 'development' },
        });
        expect(isDiagnosticModeEnabled()).toBe(true);

        // With flag string "true": true
        setDiagnosticExpoConfigForTesting({
          extra: { diagnosticsEnabled: 'true', firebaseEnvironment: 'development' },
        });
        expect(isDiagnosticModeEnabled()).toBe(true);
      } finally {
        (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = originalDev;
      }
    });
  });

  describe('formatDiagnosticReport', () => {
    it('generates a full formatted report with sanitized information', () => {
      recordNavigation('/(owner)', ['(owner)', 'index']);
      recordAuthPhase('signing_out');
      recordBreadcrumb('ui', 'sign_out_clicked', { userEmail: 'user@example.com' });

      const snapshot = getDiagnosticSnapshot();
      const error = new Error('Render invariant failed on user@example.com');
      const componentStack = '\n    in OwnerLayout\n    in AppErrorBoundary';

      const report = formatDiagnosticReport(error, componentStack, snapshot, {
        buildNumber: '37',
        commit: '1c107a4',
        env: 'development',
        version: '1.0.0',
      });

      expect(report).toContain('=== MMG CONCIERGE DIAGNOSTIC REPORT ===');
      expect(report).toContain(snapshot.incidentId);
      expect(report).toContain('Environment: development');
      expect(report).toContain('Version: 1.0.0 (Build 37)');
      expect(report).toContain('Commit: 1c107a4');
      expect(report).toContain('Route: /(owner)');
      expect(report).toContain('Auth Phase: signing_out');
      expect(report).toContain('Render invariant failed on [REDACTED_EMAIL]');
      expect(report).toContain('in OwnerLayout');
      expect(report).not.toContain('user@example.com');
    });
  });

  describe('getBuildInfo', () => {
    it('returns build metadata safely', () => {
      const buildInfo = getBuildInfo();
      expect(buildInfo).toBeDefined();
      expect(typeof buildInfo.version).toBe('string');
      expect(typeof buildInfo.buildNumber).toBe('string');
    });
  });
});
