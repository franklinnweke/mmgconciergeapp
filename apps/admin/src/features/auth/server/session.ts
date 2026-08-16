import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAdminAuth } from './firebase-admin';

export type StaffRole = 'verification_admin' | 'super_admin';

export type StaffSession = {
  uid: string;
  email?: string;
  role: StaffRole;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FIVE_MINUTES_SECONDS = 5 * 60;

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

  const claims = userRecord.customClaims || {};
  const isSuperAdmin = claims.super_admin === true;
  const isVerificationAdmin = claims.verification_admin === true;

  if (!isSuperAdmin && !isVerificationAdmin) {
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

    const claims = userRecord.customClaims || {};
    const isSuperAdmin = claims.super_admin === true;
    const isVerificationAdmin = claims.verification_admin === true;

    if (!isSuperAdmin && !isVerificationAdmin) {
      return null;
    }

    return {
      uid: userRecord.uid,
      email: userRecord.email,
      role: isSuperAdmin ? 'super_admin' : 'verification_admin',
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
