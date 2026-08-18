import type { Auth } from 'firebase-admin/auth';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  capabilitiesForRoles,
  createStaffSessionCookie,
  resolveStaffRole,
  resolveStaffRoles,
  staffActorRole,
  staffSessionHasCapability,
  verifyStaffSessionCookie,
  type StaffCapability,
  type StaffRole,
} from './session';

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
      roles: ['super_admin'],
    });
  });

  it('creates and verifies session cookie for vehicle_admin role', async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'staff-vehicle-admin',
        auth_time: nowSeconds - 30,
      }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-vehicle-admin',
        email: 'vehicle@example.com',
        disabled: false,
        emailVerified: true,
        customClaims: { vehicle_admin: true },
      }),
      createSessionCookie: vi.fn().mockResolvedValue('cookie-token-vehicle'),
      verifySessionCookie: vi.fn().mockResolvedValue({
        uid: 'staff-vehicle-admin',
      }),
    } as unknown as Auth;

    const cookie = await createStaffSessionCookie('valid-id-token', mockAuth);
    expect(cookie).toBe('cookie-token-vehicle');

    const session = await verifyStaffSessionCookie(cookie, mockAuth);
    expect(session).toEqual({
      uid: 'staff-vehicle-admin',
      email: 'vehicle@example.com',
      role: 'vehicle_admin',
      roles: ['vehicle_admin'],
    });
  });

  it('records every claim a staffer holds, in precedence order', async () => {
    const mockAuth = {
      verifySessionCookie: vi.fn().mockResolvedValue({ uid: 'staff-dual' }),
      getUser: vi.fn().mockResolvedValue({
        uid: 'staff-dual',
        email: 'dual@example.com',
        disabled: false,
        emailVerified: true,
        customClaims: { verification_admin: true, vehicle_admin: true },
      }),
    } as unknown as Auth;

    const session = await verifyStaffSessionCookie('valid-session-cookie', mockAuth);
    expect(session).toEqual({
      uid: 'staff-dual',
      email: 'dual@example.com',
      role: 'vehicle_admin',
      roles: ['vehicle_admin', 'verification_admin'],
    });
  });
});

describe('staff capability model', () => {
  const ALL_CAPABILITIES: StaffCapability[] = [
    'owners.read',
    'owners.review',
    'vehicles.read',
    'vehicles.review',
  ];

  it('resolves claims into roles and keeps the scalar role as the highest one', () => {
    expect(resolveStaffRoles({ support: true, super_admin: true })).toEqual([
      'super_admin',
      'support',
    ]);
    expect(resolveStaffRole({ support: true, super_admin: true })).toBe('super_admin');
    expect(resolveStaffRoles({})).toEqual([]);
    expect(resolveStaffRole({})).toBeNull();
  });

  it('ignores non-boolean-true claim values', () => {
    expect(resolveStaffRoles({ super_admin: 'true', vehicle_admin: 1 })).toEqual([]);
  });

  it('grants super_admin every capability', () => {
    expect(capabilitiesForRoles(['super_admin']).sort()).toEqual([...ALL_CAPABILITIES].sort());
  });

  it('scopes verification_admin to owners and vehicle_admin to vehicles', () => {
    expect(capabilitiesForRoles(['verification_admin']).sort()).toEqual([
      'owners.read',
      'owners.review',
    ]);
    expect(capabilitiesForRoles(['vehicle_admin']).sort()).toEqual([
      'vehicles.read',
      'vehicles.review',
    ]);
  });

  it('grants no desk capability to roles whose desks are not built yet', () => {
    // finance_admin / support / privacy_admin can authenticate, but must not
    // inherit the owner PII inspector or the vehicle queue by default.
    for (const role of ['finance_admin', 'support', 'privacy_admin'] as StaffRole[]) {
      expect(capabilitiesForRoles([role])).toEqual([]);
      for (const capability of ALL_CAPABILITIES) {
        expect(staffSessionHasCapability({ roles: [role] }, capability)).toBe(false);
      }
    }
  });

  it('unions capabilities so a second claim never revokes the first', () => {
    const dual = { roles: ['vehicle_admin', 'verification_admin'] as StaffRole[] };
    expect(staffSessionHasCapability(dual, 'owners.review')).toBe(true);
    expect(staffSessionHasCapability(dual, 'vehicles.review')).toBe(true);
  });

  it('picks an actor role the target service accepts, not the display role', () => {
    const dual = { roles: ['vehicle_admin', 'verification_admin'] as StaffRole[] };
    // Display precedence says vehicle_admin, but reviewOwnerVerification only
    // accepts verification_admin | super_admin.
    expect(staffActorRole(dual, ['super_admin', 'verification_admin'] as const)).toBe(
      'verification_admin',
    );
    expect(staffActorRole(dual, ['super_admin', 'vehicle_admin'] as const)).toBe('vehicle_admin');
    expect(staffActorRole({ roles: ['support'] }, ['super_admin', 'vehicle_admin'] as const)).toBeNull();
  });

  it('prefers super_admin as the recorded actor when it is held', () => {
    const both = { roles: ['super_admin', 'vehicle_admin'] as StaffRole[] };
    expect(staffActorRole(both, ['super_admin', 'vehicle_admin'] as const)).toBe('super_admin');
  });
});
