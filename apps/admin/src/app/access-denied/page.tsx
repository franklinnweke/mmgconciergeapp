import 'server-only';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  requireLiveStaffSession,
  STAFF_DESKS,
  staffSessionHasCapability,
} from '@/features/auth/server/session';

export const dynamic = 'force-dynamic';

const CAPABILITY_LABELS: Record<string, string> = {
  'owners.read': 'the owner verification desk',
  'owners.review': 'owner verification decisions',
  'vehicles.read': 'the vehicle moderation desk',
  'vehicles.review': 'vehicle moderation decisions',
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ capability?: string | string[] }>;
}) {
  // Still staff-only: an anonymous visitor is bounced to sign-in rather than
  // being told which desks exist.
  const session = await requireLiveStaffSession();
  const { capability } = await searchParams;
  const requested = Array.isArray(capability) ? capability[0] : capability;
  const requestedLabel = requested ? CAPABILITY_LABELS[requested] : undefined;

  const availableDesks = STAFF_DESKS.filter((desk) =>
    staffSessionHasCapability(session, desk.capability),
  );

  return (
    <main
      style={{
        minHeight: '100svh',
        backgroundColor: '#0E1117',
        color: '#F3F4F6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}
    >
      <section
        style={{
          maxWidth: '520px',
          width: '100%',
          backgroundColor: '#151A22',
          border: '1px solid #232A36',
          borderRadius: '14px',
          padding: '32px',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 650, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          You do not have access to {requestedLabel || 'this workspace'}
        </h1>

        <p style={{ color: '#8B93A1', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
          Your staff account is signed in, but the claims on it do not grant this desk. Ask a
          super admin to grant the matching staff role if you need it.
        </p>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            margin: '22px 0 0',
            fontSize: '12px',
          }}
        >
          <dt style={{ color: '#6B7280' }}>Signed in as</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{session.email || session.uid}</dd>
          <dt style={{ color: '#6B7280' }}>Staff roles</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{session.roles.join(', ')}</dd>
        </dl>

        {availableDesks.length > 0 ? (
          <div style={{ marginTop: '26px', borderTop: '1px solid #232A36', paddingTop: '20px' }}>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '0.16em',
                color: '#765E2D',
                margin: '0 0 12px',
              }}
            >
              DESKS YOU CAN OPEN
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
              {availableDesks.map((desk) => (
                <li key={desk.href}>
                  <Link
                    href={desk.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '12px 14px',
                      minHeight: '44px',
                      borderRadius: '8px',
                      backgroundColor: '#0E1117',
                      border: '1px solid #232A36',
                      color: '#F3F4F6',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {desk.label}
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p
            style={{
              marginTop: '26px',
              borderTop: '1px solid #232A36',
              paddingTop: '20px',
              color: '#8B93A1',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            No operations desk is assigned to your roles yet.
          </p>
        )}
      </section>
    </main>
  );
}
