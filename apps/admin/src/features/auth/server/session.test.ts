import type { Auth } from 'firebase-admin/auth';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createStaffSessionCookie, verifyStaffSessionCookie } from './session';

describe('admin staff session management', () => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  it('rejects ID token if auth_time is older than 5 minutes', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'staff-1',
        auth_time: nowSeconds - 301, // 5 min and 1 sec ago
      }),
      getUser: vi.fn(),
      createSessionCookie: vi.fn(),
    } as unknown as Auth;

    await expect(
      createStaffSessionCookie('stale-id-token', mockAuth),
    ).rejects.toThrowError(/stale/);
  });

  it('rejects ID token if user account is disabled', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'staff-1',
        auth_time: nowSeconds - 60,
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-1',
        disabled: true,
        customClaims: { verification_admin: true },
      }),
      createSessionCookie: vi.fn(),
    } as unknown as Auth;

    await expect(
      createStaffSessionCookie('valid-id-token', mockAuth),
    ).rejects.toThrowError(/disabled/);
  });

  it('rejects ID token if user email is not verified', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'staff-1',
        auth_time: nowSeconds - 60,
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-1',
        disabled: false,
        emailVerified: false,
        customClaims: { verification_admin: true },
      }),
      createSessionCookie: vi.fn(),
    } as unknown as Auth;

    await expect(
      createStaffSessionCookie('valid-id-token', mockAuth),
    ).rejects.toThrowError(/Staff email must be verified/);
  });

  it('rejects ID token if user does not have staff claims', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'regular-user',
        auth_time: nowSeconds - 60,
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'regular-user',
        disabled: false,
        emailVerified: true,
        customClaims: {}, // No staff claim
      }),
      createSessionCookie: vi.fn(),
    } as unknown as Auth;

    await expect(
      createStaffSessionCookie('valid-id-token', mockAuth),
    ).rejects.toThrowError(/Staff verification privileges required/);
  });

  it('creates session cookie for authorized verification_admin', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'staff-admin',
        auth_time: nowSeconds - 30,
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-admin',
        email: 'staff@example.com',
        disabled: false,
        emailVerified: true,
        customClaims: { verification_admin: true },
      }),
      createSessionCookie: vi.fn().mockResolvedValue('cookie-token-123'),
    } as unknown as Auth;

    const cookie = await createStaffSessionCookie('valid-id-token', mockAuth);
    expect(cookie).toBe('cookie-token-123');
  });

  it('verifies session cookie against live user record (detecting stripped claims)', async () => {
    const mockAuth = {
      verifySessionCookie: vi.fn().mockResolvedValue({
        uid: 'staff-admin',
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-admin',
        email: 'staff@example.com',
        disabled: false,
        emailVerified: true,
        customClaims: { super_admin: true },
      }),
    } as unknown as Auth;

    const session = await verifyStaffSessionCookie('valid-session-cookie', mockAuth);
    expect(session).toEqual({
      uid: 'staff-admin',
      email: 'staff@example.com',
      role: 'super_admin',
    });
  });

  it('returns null if claims were stripped from user record after cookie issuance', async () => {
    const mockAuth = {
      verifySessionCookie: vi.fn().mockResolvedValue({
        uid: 'former-staff',
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'former-staff',
        email: 'staff@example.com',
        disabled: false,
        emailVerified: true,
        customClaims: {}, // Claims stripped!
      }),
    } as unknown as Auth;

    const session = await verifyStaffSessionCookie('valid-session-cookie', mockAuth);
    expect(session).toBeNull();
  });
});
