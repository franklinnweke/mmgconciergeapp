import 'server-only';

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { getAdminApp, getAdminFirestore } from '@/features/auth/server/firebase-admin';
import {
  staffSessionHasCapability,
  type StaffSession,
} from '@/features/auth/server/session';

export type DashboardMetric = {
  label: string;
  value: number;
  helper: string;
  href: string;
};

export type DashboardActivity = {
  id: string;
  kind: 'payment' | 'request';
  title: string;
  detail: string;
  status: string;
  occurredAt: string;
  href: string;
};

export type OperationsDashboardSnapshot = {
  projectId: string;
  generatedAt: string;
  metrics: DashboardMetric[];
  activity: DashboardActivity[];
};

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    const parsed = (value as { toDate?: () => Date }).toDate?.();
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function money(value: unknown): string {
  const kobo = typeof value === 'number' && Number.isSafeInteger(value) ? value : 0;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function stringValue(data: DocumentData, key: string, fallback = ''): string {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

async function countWhere(collection: string, field: string, value: string): Promise<number> {
  const snapshot = await getAdminFirestore().collection(collection).where(field, '==', value).count().get();
  return snapshot.data().count;
}

export async function loadOperationsDashboard(session: StaffSession): Promise<OperationsDashboardSnapshot> {
  const firestore = getAdminFirestore();
  const canReadBookings = staffSessionHasCapability(session, 'bookings.read');
  const canReadPayments = staffSessionHasCapability(session, 'payments.read');
  const canReadOwners = staffSessionHasCapability(session, 'owners.read');
  const canReadVehicles = staffSessionHasCapability(session, 'vehicles.read');
  const canReadUsers = staffSessionHasCapability(session, 'users.read');

  const metrics: DashboardMetric[] = [];
  const activity: DashboardActivity[] = [];

  if (canReadBookings) {
    const [requested, approved, paymentWindows, confirmed, cases, recentRequests] = await Promise.all([
      countWhere('rentalRequests', 'state', 'requested'),
      countWhere('rentalRequests', 'state', 'approved'),
      countWhere('rentalRequests', 'state', 'ready_for_payment'),
      countWhere('rentalRequests', 'state', 'confirmed'),
      firestore.collection('bookingCases').orderBy('openedAt', 'desc').limit(50).get(),
      firestore.collection('rentalRequests').orderBy('updatedAt', 'desc').limit(6).get(),
    ]);

    const interventionCount = cases.docs.filter((document) => {
      const status = stringValue(document.data(), 'status');
      return status !== 'resolved' && status !== 'closed';
    }).length;

    metrics.push(
      { label: 'Awaiting approval', value: requested, helper: 'Soft requests waiting for a decision', href: '/bookings' },
      { label: 'Approved requests', value: approved, helper: 'Ready for concierge contact', href: '/bookings' },
      { label: 'Payment windows', value: paymentWindows, helper: '30-minute customer windows currently open', href: '/bookings' },
      { label: 'Confirmed bookings', value: confirmed, helper: 'Request-first bookings secured', href: '/bookings' },
      { label: 'Needs attention', value: interventionCount, helper: 'Open booking intervention cases', href: '/bookings' },
    );

    for (const document of recentRequests.docs) {
      const data = document.data();
      const vehicleSnapshot = data.vehicleSnapshot && typeof data.vehicleSnapshot === 'object'
        ? data.vehicleSnapshot as Record<string, unknown>
        : {};
      const vehicle = typeof vehicleSnapshot.displayName === 'string' ? vehicleSnapshot.displayName : 'Rental request';
      const state = stringValue(data, 'state', 'unknown');
      activity.push({
        id: `request-${document.id}`,
        kind: 'request',
        title: vehicle,
        detail: `${stringValue(data, 'startDate', 'Date pending')} to ${stringValue(data, 'endDate', 'Date pending')}`,
        status: state.replaceAll('_', ' '),
        occurredAt: toIso(data.updatedAt),
        href: '/bookings',
      });
    }
  }

  if (canReadPayments) {
    const [successfulPayments, pendingPayments, recentPayments] = await Promise.all([
      countWhere('payments', 'state', 'succeeded'),
      countWhere('payments', 'state', 'pending'),
      firestore.collection('payments').orderBy('createdAt', 'desc').limit(6).get(),
    ]);

    const successfulVolumeSnapshot = await firestore.collection('payments')
      .where('state', '==', 'succeeded')
      .select('amountKobo')
      .get();
    const successfulVolumeKobo = successfulVolumeSnapshot.docs.reduce((total, document) => {
      const amount = document.data().amountKobo;
      return total + (typeof amount === 'number' && Number.isSafeInteger(amount) ? amount : 0);
    }, 0);

    metrics.push(
      { label: 'Successful payments', value: successfulPayments, helper: `${money(successfulVolumeKobo)} verified volume`, href: '/payments' },
      { label: 'Pending payments', value: pendingPayments, helper: 'Provider reconciliation still open', href: '/payments' },
    );

    for (const document of recentPayments.docs) {
      const data = document.data();
      const state = stringValue(data, 'state', 'unknown');
      activity.push({
        id: `payment-${document.id}`,
        kind: 'payment',
        title: money(data.amountKobo),
        detail: stringValue(data, 'reference', document.id),
        status: state.replaceAll('_', ' '),
        occurredAt: toIso(data.updatedAt ?? data.createdAt),
        href: `/payments/${encodeURIComponent(document.id)}`,
      });
    }
  }

  if (canReadOwners) {
    metrics.push({
      label: 'Owner reviews',
      value: await countWhere('ownerVerifications', 'status', 'submitted'),
      helper: 'Submitted verification applications',
      href: '/owners',
    });
  }

  if (canReadVehicles) {
    metrics.push({
      label: 'Vehicle reviews',
      value: await countWhere('vehicles', 'moderationStatus', 'submitted'),
      helper: 'Vehicles awaiting moderation',
      href: '/vehicles',
    });
  }

  if (canReadUsers) {
    const usersCount = await firestore.collection('users').count().get();
    metrics.push({
      label: 'Platform users',
      value: usersCount.data().count,
      helper: 'Authenticated MMG identities',
      href: '/users',
    });
  }

  activity.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

  return {
    projectId: getAdminApp().options.projectId ?? 'unknown-project',
    generatedAt: new Date().toISOString(),
    metrics,
    activity: activity.slice(0, 10),
  };
}
