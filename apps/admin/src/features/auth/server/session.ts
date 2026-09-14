import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAdminAuth } from './firebase-admin';

export type StaffRole =
  | 'super_admin'
  | 'vehicle_admin'
  | 'verification_admin'
  | 'finance_admin'
  | 'support'
  | 'privacy_admin';

/**
 * What a staff member is allowed to do, independent of how many claims they
 * hold. Pages and server actions gate on capabilities, never on the scalar
 * `role`: a staffer can legitimately carry several claims at once, and the
 * scalar only records the highest-precedence one for display and audit.
 */
export type StaffCapability =
  | 'bookings.read'
  | 'bookings.manage_requests'
  | 'owners.read'
  | 'owners.review'
  | 'users.read'
  | 'vehicles.read'
  | 'vehicles.review';

/**
 * Booking request management is intentionally narrower than generic booking
 * writes. Support and super-admin may approve/decline soft requests and open
 * the authoritative 30-minute payment window. Refunds, payouts and arbitrary
 * paid-booking mutation remain outside this capability.
 */
const CAPABILITIES_BY_ROLE: Record<StaffRole, readonly StaffCapability[]> = {
  super_admin: [
    'bookings.read',
    'bookings.manage_requests',
    'owners.read',
    'owners.review',
    'users.read',
    'vehicles.read',
    'vehicles.review',
  ],
  verification_admin: ['owners.read', 'owners.review'],
  vehicle_admin: ['vehicles.read', 'vehicles.review'],
  finance_admin: [],
  support: ['bookings.read', 'bookings.manage_requests'],
  privacy_admin: ['users.read'],
};

const STAFF_ROLE_PRECEDENCE: readonly StaffRole[] = [
  'super_admin',
  'vehicle_admin',
  'verification_admin',
  'finance_admin',
  'support',
  'privacy_admin',
];

export type StaffSession = {
  uid: string;
  email?: string;
  role: StaffRole;
  roles: StaffRole[];
};

export const STAFF_DESKS: readonly { href: string; label: string; capability: StaffCapability }[] = [
  { href: '/', label: 'Booking concierge desk', capability: 'bookings.read' },
  { href: '/owners', label: 'Owner verification desk', capability: 'owners.read' },
  { href: '/vehicles', label: 'Vehicle moderation desk', capability: 'vehicles.read' },
  { href: '/users', label: 'Platform users', capability: 'users.read' },
];

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FIVE_MINUTES_SECONDS = 5 * 60;

export function resolveStaffRoles(claims: Record<string, unknown> = {}): StaffRole[] {
  return STAFF_ROLE_PRECEDENCE.filter((role) => claims[role] === true);
}

export function resolveStaffRole(claims: Record<string, unknown> = {}): StaffRole | null {
  return resolveStaffRoles(claims)[0] ?? null;
}

export function capabilitiesForRoles(roles: readonly StaffRole[]): StaffCapability[] {
  const capabilities = new Set<StaffCapability>();
  for (const role of roles) {
    for (const capability of CAPABILITIES_BY_ROLE[role] ?? []) {
      capabilities.add(capability);
    }
  }
  return [...capabilities];
}

export function staffSessionHasCapability(
  session: Pick<StaffSession, 'roles'>,
  capability: StaffCapability,
): boolean {
  return capabilitiesForRoles(session.roles).includes(capability);
}

export function staffActorRole<T extends StaffRole>(
  session: Pick<StaffSession, 'roles'>,
  accepted: readonly T[],
): T | null {
  for (const role of STAFF_ROLE_PRECEDENCE) {
    if (session.roles.includes(role) && (accepted as readonly StaffRole[]).includes(role)) {
      return role as T;
    }
  }
  return null;
}

export async function createStaffSessionCookie(
  idToken: string,
  auth = getAdminAuth(),
): Promise<string> {
  const decodedToken = await auth.verifyIdToken(idToken, true);

  const authTime = decodedToken.auth_time;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authTime > FIVE_MINUTES_SECONDS) {
    throw new Error('Authentication is stale. Please sign in again.');
  }

  const userRecord = await auth.getUser(decodedToken.uid);
  if (userRecord.disabled) {
    throw new Error('User account is disabled.');
  }

  if (!userRecord.emailVerified) {
    throw new Error('Access denied. Staff email must be verified.');
  }

  const roles = resolveStaffRoles(userRecord.customClaims || {});
  if (roles.length === 0) {
    throw new Error('Access denied. Staff privileges required.');
  }

  return auth.createSessionCookie(idToken, { expiresIn: FIVE_DAYS_MS });
}

export async function verifyStaffSessionCookie(
  sessionCookie: string,
  auth = getAdminAuth(),
): Promise<StaffSession | null> {
  if (!sessionCookie) return null;

  try {
    const decodedCookie = await auth.verifySessionCookie(sessionCookie, true);
    const userRecord = await auth.getUser(decodedCookie.uid);

    if (userRecord.disabled || !userRecord.emailVerified) {
      return null;
    }

    const roles = resolveStaffRoles(userRecord.customClaims || {});
    if (roles.length === 0) {
      return null;
    }

    return {
      uid: userRecord.uid,
      email: userRecord.email,
      role: roles[0],
      roles,
    };
  } catch {
    return null;
  }
}

export async function requireLiveStaffSession(): Promise<StaffSession> {
  if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
    return {
      uid: 'fixture-staff-admin',
      email: 'staff@mmgconcierge.test',
      role: 'super_admin',
      roles: ['super_admin'],
    };
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    redirect('/sign-in');
  }

  const session = await verifyStaffSessionCookie(sessionCookie);
  if (!session) {
    redirect('/sign-in');
  }

  return session;
}

export async function requireStaffCapability(capability: StaffCapability): Promise<StaffSession> {
  const session = await requireLiveStaffSession();

  if (!staffSessionHasCapability(session, capability)) {
    redirect(`/access-denied?capability=${encodeURIComponent(capability)}`);
  }

  return session;
}
