'use client';

import type { OwnerVerificationStatus } from '@mmg/contracts';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { OwnerVerificationListItem } from '../domain/types';

export type OwnerVerificationQueueProps = {
  items: OwnerVerificationListItem[];
  hasMore?: boolean;
  nextCursor?: string | null;
  isFirstPage?: boolean;
  staffEmail?: string;
  staffRole?: string;
};

const FILTERS: Array<{ id: OwnerVerificationStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'revoked', label: 'Revoked' },
  { id: 'draft', label: 'Draft' },
];

function statusClass(status: OwnerVerificationStatus) {
  if (status === 'approved') return 'green';
  if (status === 'rejected' || status === 'revoked') return 'red';
  if (status === 'under_review') return 'blue';
  if (status === 'submitted' || status === 'suspended') return 'gold';
  return 'muted';
}

function statusLabel(status: OwnerVerificationStatus) {
  return status.replaceAll('_', ' ');
}

export function OwnerVerificationQueue({
  items,
  hasMore = false,
  nextCursor = null,
  isFirstPage = true,
  staffEmail,
  staffRole,
}: OwnerVerificationQueueProps) {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OwnerVerificationStatus | 'all'>('all');

  const counts = Object.fromEntries(
    FILTERS.map((filter) => [
      filter.id,
      filter.id === 'all' ? items.length : items.filter((item) => item.status === filter.id).length,
    ]),
  );

  const filteredItems = items.filter((item) => {
    if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [item.legalName, item.emailMasked, item.phoneMasked ?? '', item.areaLabel ?? '', item.ownerId]
      .some((value) => value.toLowerCase().includes(q));
  });

  const submittedCount = items.filter((item) => item.status === 'submitted').length;
  const reviewCount = items.filter((item) => item.status === 'under_review').length;

  return (
    <AdminOperationsShell
      activeSection="owners"
      eyebrow="OWNER OPERATIONS"
      headerMeta={(
        <>
          <strong>{staffEmail || 'Staff operator'}</strong>
          <span>{(staffRole || 'verification_admin').replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={staffEmail}
      staffRole={staffRole}
      title="Owner verification"
    >
      <section className="admin-summary-row" aria-label="Owner verification summary">
        <div className="admin-summary-item"><span>Loaded</span><strong>{items.length}</strong></div>
        <div className="admin-summary-item"><span>Submitted</span><strong>{submittedCount}</strong></div>
        <div className="admin-summary-item"><span>Under review</span><strong>{reviewCount}</strong></div>
      </section>

      <div className="admin-toolbar">
        <div className="admin-filter-group" aria-label="Owner status filters">
          {FILTERS.map((filter) => (
            <button
              className="admin-filter-button"
              data-active={selectedStatus === filter.id}
              key={filter.id}
              onClick={() => setSelectedStatus(filter.id)}
              type="button"
            >
              {filter.label}<span className="admin-filter-count">{counts[filter.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search size={15} />
          <span className="sr-only">Search owners</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search owner, email or area"
            type="search"
            value={search}
          />
        </label>
      </div>

      <div className="admin-table-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Area</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Updated</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr><td className="admin-empty" colSpan={6}>No owner applications match the current filters.</td></tr>
            ) : filteredItems.map((item) => (
              <tr key={item.ownerId}>
                <td>
                  <div className="admin-primary">{item.legalName}</div>
                  <div className="admin-secondary">{item.emailMasked}{item.phoneMasked ? ` · ${item.phoneMasked}` : ''}</div>
                </td>
                <td>{item.areaLabel || 'Lagos'}</td>
                <td><span className={`admin-status ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                <td>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                <td>{new Date(item.updatedAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link className="admin-action-link" href={`/owners/${item.ownerId}`}>Inspect<ChevronRight size={14} /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <span>
          Showing {filteredItems.length} of {items.length} loaded applications{hasMore ? '. Filters cover this page only.' : '.'}
        </span>
        <div className="admin-pagination-actions">
          {!isFirstPage ? <Link className="admin-page-link" href="/owners"><ChevronLeft size={14} />Newest</Link> : null}
          {hasMore && nextCursor ? <Link className="admin-page-link" href={`/owners?cursor=${encodeURIComponent(nextCursor)}`}>Older<ChevronRight size={14} /></Link> : null}
        </div>
      </div>
    </AdminOperationsShell>
  );
}
