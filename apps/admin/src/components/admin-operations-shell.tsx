'use client';

import {
  Car,
  Globe2,
  CreditCard,
  LayoutDashboard,
  LayoutList,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export type AdminSection = 'dashboard' | 'bookings' | 'payments' | 'vehicles' | 'owners' | 'users';

type AdminOperationsShellProps = {
  activeSection: AdminSection;
  children: ReactNode;
  eyebrow?: string;
  headerMeta?: ReactNode;
  staffEmail?: string;
  staffRole?: string;
  title: string;
};

const NAV_ITEMS: Array<{
  href: string;
  icon: typeof LayoutList;
  id: AdminSection;
  label: string;
}> = [
  { href: '/', icon: LayoutDashboard, id: 'dashboard', label: 'Dashboard' },
  { href: '/bookings', icon: LayoutList, id: 'bookings', label: 'Bookings' },
  { href: '/payments', icon: CreditCard, id: 'payments', label: 'Payments' },
  { href: '/vehicles', icon: Car, id: 'vehicles', label: 'Vehicles' },
  { href: '/owners', icon: ShieldCheck, id: 'owners', label: 'Owners' },
  { href: '/users', icon: Users, id: 'users', label: 'Users' },
];

export function AdminOperationsShell({
  activeSection,
  children,
  eyebrow = 'OPERATIONS',
  headerMeta,
  staffEmail,
  staffRole,
  title,
}: AdminOperationsShellProps) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <div className="operations-shell admin-operations-shell">
      <aside className="sidebar admin-sidebar">
        <div className="brand-lockup" aria-label="MMG Concierge Operations">
          <span className="brand-mark">MMG</span>
          <span className="admin-brand-caption">Concierge operations</span>
        </div>

        <nav aria-label="Operations navigation" className="primary-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return (
              <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.id}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          {(staffRole === 'super_admin' || staffRole === 'vehicle_admin') && <Link href="/web" className="admin-signout-button"><Globe2 size={15}/><span>Website workspace</span></Link>}
          <div className="admin-environment-note">
            <span className="environment-dot fixture" />
            <span>Development</span>
          </div>
          <div className="admin-staff-summary">
            <strong>{staffEmail || 'Staff operator'}</strong>
            <span>{(staffRole || 'staff').replaceAll('_', ' ')}</span>
          </div>
          <button className="admin-signout-button" onClick={handleSignOut} type="button">
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="workspace admin-workspace">
        <header className="workspace-header admin-workspace-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          {headerMeta ? <div className="admin-header-meta">{headerMeta}</div> : null}
        </header>

        {children}
      </main>
    </div>
  );
}
