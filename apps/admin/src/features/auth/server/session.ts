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
export type StaffCapability = 'owners.read' | 'owners.review' | 'vehicles.read' | 'vehicles.review';

/**
 * Fail-closed by construction. A role absent from this map, or present with an
 * empty list, reaches no data desk — `finance_admin`, `support`, and
 * `privacy_admin` can authenticate but their desks are not built yet, so they
 * must not inherit the owner PII inspector or the vehicle queue by default.
 */
const CAPABILITIES_BY_ROLE: Record<StaffRole, readonly StaffCapability[]> = {
  super_admin: ['owners.read', 'owners.review', 'vehicles.read', 'vehicles.review'],
  verification_admin: ['owners.read', 'owners.review'],
  vehicle_admin: ['vehicles.read', 'vehicles.review'],
  finance_admin: [],
  support: [],
  privacy_admin: [],
};

/**
 * Highest privilege first. Used only to pick the scalar `role` shown in the
 * header and sent to the callable services as the actor role.
 */
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
  /** Highest-precedence claim. For display and audit only — do not authorize on it. */
  role: StaffRole;
  /** Every claim the staffer actually holds. */
  roles: StaffRole[];
};

/** A capability-gated desk, used to tell a denied staffer where they *can* go. */
export const STAFF_DESKS: readonly { href: string; label: string; capability: StaffCapability }[] = [
  { href: '/owners', label: 'Owner verification desk', capability: 'owners.read' },
  { href: '/vehicles', label: 'Vehicle moderation desk', capability: 'vehicles.read' },
];

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FIVE_MINUTES_SECONDS = 5 * 60;

/** Every staff role the claims grant, in precedence order. Empty means not staff. */
export function resolveStaffRoles(claims: Record<string, unknown> = {}): StaffRole[] {
  return STAFF_ROLE_PRECEDENCE.filter((role) => claims[role] === true);
}

/** The highest-precedence staff role, or null when the claims grant none. */
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

/**
 * The single authorization predicate. Union of every held role's capabilities,
 * so granting a second claim can never revoke what the first one allowed.
 */
export function staffSessionHasCapability(
  session: Pick<StaffSession, 'roles'>,
  capability: StaffCapability,
): boolean {
  return capabilitiesForRoles(session.roles).includes(capability);
}

/**
 * Which of the roles a callable service accepts should be recorded as the
 * actor. Services type their actor narrowly (e.g. `'verification_admin' |
 * 'super_admin'`), and a staffer holding several claims must be recorded under
 * one the service recognises — not under whichever claim happens to win the
 * display precedence.
 */
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
    throw new Error('Access denied. Staff verification privileges required.');
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

/**
 * Page-level gate. Redirects rather than rendering, so a page body that reads
 * owner PII or mints signed ID-document URLs cannot run at all without the
 * capability. Server actions must use `staffSessionHasCapability` instead —
 * `redirect()` throws, and an action's own error handling would swallow it.
 */
export async function requireStaffCapability(capability: StaffCapability): Promise<StaffSession> {
  const session = await requireLiveStaffSession();

  if (!staffSessionHasCapability(session, capability)) {
    redirect(`/access-denied?capability=${encodeURIComponent(capability)}`);
  }

  return session;
}
