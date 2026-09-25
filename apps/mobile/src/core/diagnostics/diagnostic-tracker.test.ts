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

    it('redacts sensitive keys in breadcrumb data payload', () => {
      recordBreadcrumb('ui', 'submit_form', {
        email: 'private@mmg.com',
        phoneNumber: '+2348012345678',
        safeKey: 'active_step',
      });

      const snapshot = getDiagnosticSnapshot();
      const data = snapshot.breadcrumbs[0].data;
      expect(data).toBeDefined();
      expect(data?.email).toBe('[REDACTED]');
      expect(data?.phoneNumber).toBe('[REDACTED]');
      expect(data?.safeKey).toBe('active_step');
    });
  });

  describe('isDiagnosticModeEnabled', () => {
    it('returns false when firebaseEnvironment is production', () => {
      setDiagnosticExpoConfigForTesting({
        extra: { firebaseEnvironment: 'production' },
      });

      expect(isDiagnosticModeEnabled()).toBe(false);
    });

    it('returns true when firebaseEnvironment is development', () => {
      setDiagnosticExpoConfigForTesting({
        extra: { firebaseEnvironment: 'development' },
      });

      expect(isDiagnosticModeEnabled()).toBe(true);
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
