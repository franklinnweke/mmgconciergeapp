'use client';

import type { VehicleModerationStatus } from '@mmg/contracts';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { VehicleModerationListItem } from '../domain/types';

export type VehicleModerationQueueProps = {
  items: VehicleModerationListItem[];
  hasMore?: boolean;
  nextCursor?: string | null;
  isFirstPage?: boolean;
  staffEmail?: string;
  staffRole?: string;
};

const FILTERS: Array<{ id: VehicleModerationStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending_review', label: 'Pending review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'draft', label: 'Draft' },
];

function formatNaira(kobo: number) {
  return `₦${Math.floor(kobo / 100).toLocaleString('en-NG')}`;
}

function statusClass(status: VehicleModerationStatus) {
  if (status === 'approved') return 'green';
  if (status === 'rejected' || status === 'suspended') return 'red';
  if (status === 'pending_review') return 'gold';
  return 'muted';
}

export function VehicleModerationQueue({
  items,
  hasMore = false,
  nextCursor = null,
  isFirstPage = true,
  staffEmail,
  staffRole,
}: VehicleModerationQueueProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<VehicleModerationStatus | 'all'>('all');

  const counts = Object.fromEntries(
    FILTERS.map((filter) => [
      filter.id,
      filter.id === 'all' ? items.length : items.filter((item) => item.moderationStatus === filter.id).length,
    ]),
  );

  const filteredItems = items.filter((item) => {
    if (selectedStatus !== 'all' && item.moderationStatus !== selectedStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [item.make, item.model, item.ownerLegalName, item.areaLabel, item.plateMasked]
      .some((value) => value.toLowerCase().includes(q));
  });

  const pendingCount = items.filter((item) => item.moderationStatus === 'pending_review').length;
  const approvedCount = items.filter((item) => item.moderationStatus === 'approved').length;

  return (
    <AdminOperationsShell
      activeSection="vehicles"
      eyebrow="FLEET OPERATIONS"
      headerMeta={(
        <>
          <strong>{staffEmail || 'Staff operator'}</strong>
          <span>{(staffRole || 'vehicle_admin').replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={staffEmail}
      staffRole={staffRole}
      title="Vehicle moderation"
    >
      <section className="admin-summary-row" aria-label="Vehicle moderation summary">
        <div className="admin-summary-item"><span>Loaded</span><strong>{items.length}</strong></div>
        <div className="admin-summary-item"><span>Pending</span><strong>{pendingCount}</strong></div>
        <div className="admin-summary-item"><span>Approved</span><strong>{approvedCount}</strong></div>
      </section>

      <div className="admin-toolbar">
        <div className="admin-filter-group" aria-label="Vehicle moderation filters">
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
          <span className="sr-only">Search vehicles</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vehicle, owner or plate"
            type="search"
            value={search}
          />
        </label>
      </div>

      <div className="admin-table-panel">
        <table className="admin-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Owner</th>
              <th>Area</th>
              <th>Rate</th>
              <th>Status</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr><td className="admin-empty" colSpan={6}>No vehicles match the current filters.</td></tr>
            ) : filteredItems.map((item) => (
              <tr key={item.vehicleId}>
                <td>
                  <div className="admin-identity">
                    <span
                      aria-hidden="true"
                      className="admin-thumb"
                      style={{ backgroundImage: `url(${item.thumbnailUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
                    />
                    <div>
                      <div className="admin-primary">{item.make} {item.model}</div>
                      <div className="admin-secondary">{item.year} · {item.plateMasked} · {item.imageCount} photos</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="admin-primary">{item.ownerLegalName}</div>
                  <div className="admin-secondary admin-mono">{item.ownerId.slice(0, 12)}…</div>
                </td>
                <td>{item.areaLabel}</td>
                <td className="admin-primary">{formatNaira(item.dailyRateKobo)}</td>
                <td><span className={`admin-status ${statusClass(item.moderationStatus)}`}>{item.moderationStatus.replaceAll('_', ' ')}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <Link className="admin-action-link" href={`/vehicles/${item.vehicleId}`}>Inspect<ChevronRight size={14} /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <span>Showing {filteredItems.length} of {items.length} loaded vehicles{hasMore ? '. Filters cover this page only.' : '.'}</span>
        <div className="admin-pagination-actions">
          {!isFirstPage ? (
            <button className="admin-button secondary" onClick={() => router.push('/vehicles')} type="button"><ChevronLeft size={14} />Newest</button>
          ) : null}
          {hasMore && nextCursor ? (
            <button className="admin-button secondary" onClick={() => router.push(`/vehicles?cursor=${encodeURIComponent(nextCursor)}`)} type="button">Older<ChevronRight size={14} /></button>
          ) : null}
        </div>
      </div>
    </AdminOperationsShell>
  );
}
