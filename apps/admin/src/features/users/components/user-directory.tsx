'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { AdminUserListItem } from '../data/firestore-admin-user-gateway';

type UserDirectoryProps = {
  items: AdminUserListItem[];
  nextCursor: string | null;
  isFirstPage: boolean;
  staffEmail?: string;
  staffRole?: string;
};

type AccountFilter = 'all' | AdminUserListItem['accountType'];

const FILTERS: Array<{ id: AccountFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'renter', label: 'Renters' },
  { id: 'owner', label: 'Owners' },
  { id: 'unassigned', label: 'Unassigned' },
];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UserDirectory({
  items,
  nextCursor,
  isFirstPage,
  staffEmail,
  staffRole,
}: UserDirectoryProps) {
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (accountFilter !== 'all' && item.accountType !== accountFilter) return false;
      if (!query) return true;
      return [item.displayName, item.email, item.uid, item.accountType]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [accountFilter, items, search]);

  const counts = Object.fromEntries(FILTERS.map((filter) => [
    filter.id,
    filter.id === 'all' ? items.length : items.filter((item) => item.accountType === filter.id).length,
  ]));
  const verifiedCount = items.filter((item) => item.emailVerified).length;
  const disabledCount = items.filter((item) => item.disabled).length;

  return (
    <AdminOperationsShell
      activeSection="users"
      eyebrow="PLATFORM OPERATIONS"
      headerMeta={(
        <>
          <strong>{staffEmail || 'Staff operator'}</strong>
          <span>{(staffRole || 'staff').replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={staffEmail}
      staffRole={staffRole}
      title="Users"
    >
      <section aria-label="User directory summary" className="admin-summary-row">
        <div className="admin-summary-item"><span>Loaded</span><strong>{items.length}</strong></div>
        <div className="admin-summary-item"><span>Email verified</span><strong>{verifiedCount}</strong></div>
        <div className="admin-summary-item"><span>Disabled</span><strong>{disabledCount}</strong></div>
      </section>

      <div className="admin-toolbar">
        <div aria-label="Account type filters" className="admin-filter-group">
          {FILTERS.map((filter) => (
            <button
              className="admin-filter-button"
              data-active={accountFilter === filter.id}
              key={filter.id}
              onClick={() => setAccountFilter(filter.id)}
              type="button"
            >
              {filter.label}<span className="admin-filter-count">{counts[filter.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search size={15} />
          <span className="sr-only">Search users</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email or user ID"
            type="search"
            value={search}
          />
        </label>
      </div>

      <div className="admin-table-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Account</th>
              <th>Email</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last sign in</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr><td className="admin-empty" colSpan={6}>No users match the current filters.</td></tr>
            ) : filteredItems.map((item) => (
              <tr key={item.uid}>
                <td>
                  <div className="admin-primary">{item.displayName}</div>
                  <div className="admin-secondary">{item.uid}</div>
                </td>
                <td><span className={`admin-status ${item.accountType === 'owner' ? 'gold' : item.accountType === 'renter' ? 'blue' : 'muted'}`}>{item.accountType}</span></td>
                <td>
                  <div className="admin-primary">{item.email}</div>
                  <div className="admin-secondary">{item.emailVerified ? 'Verified' : 'Not verified'}</div>
                </td>
                <td><span className={`admin-status ${item.disabled ? 'red' : 'green'}`}>{item.disabled ? 'Disabled' : 'Active'}</span></td>
                <td>{formatDate(item.createdAt)}</td>
                <td>{formatDate(item.lastSignInAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <span>Showing {filteredItems.length} of {items.length} users loaded on this page.</span>
        <div className="admin-pagination-actions">
          {!isFirstPage ? <Link className="admin-page-link" href="/users"><ChevronLeft size={14} />First page</Link> : null}
          {nextCursor ? (
            <Link className="admin-page-link" href={`/users?cursor=${encodeURIComponent(nextCursor)}`}>
              More users<ChevronRight size={14} />
            </Link>
          ) : null}
        </div>
      </div>
    </AdminOperationsShell>
  );
}
