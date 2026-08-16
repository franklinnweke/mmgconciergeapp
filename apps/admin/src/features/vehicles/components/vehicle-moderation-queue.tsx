'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VehicleModerationStatus } from '@mmg/contracts';
import {
  Car,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Eye,
} from 'lucide-react';

import type { VehicleModerationListItem } from '../domain/types';

export type VehicleModerationQueueProps = {
  items: VehicleModerationListItem[];
  hasMore?: boolean;
  nextCursor?: string | null;
  isFirstPage?: boolean;
  staffEmail?: string;
  staffRole?: string;
};

const STATUS_CONFIG: Record<
  VehicleModerationStatus,
  { label: string; bg: string; text: string; icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Draft', bg: '#1E222B', text: '#9AA0A6', icon: FileText },
  pending_review: { label: 'Pending Review', bg: 'rgba(234, 179, 8, 0.12)', text: '#EAB308', icon: Clock },
  approved: { label: 'Approved', bg: 'rgba(34, 197, 94, 0.12)', text: '#4ADE80', icon: CheckCircle2 },
  rejected: { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.12)', text: '#F87171', icon: XCircle },
  suspended: { label: 'Suspended', bg: 'rgba(220, 38, 38, 0.18)', text: '#EF4444', icon: AlertTriangle },
};

function formatNaira(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  return '₦' + naira.toLocaleString('en-NG');
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

  const counts: Record<string, number> = {
    all: items.length,
    pending_review: items.filter((i) => i.moderationStatus === 'pending_review').length,
    approved: items.filter((i) => i.moderationStatus === 'approved').length,
    rejected: items.filter((i) => i.moderationStatus === 'rejected').length,
    suspended: items.filter((i) => i.moderationStatus === 'suspended').length,
    draft: items.filter((i) => i.moderationStatus === 'draft').length,
  };

  const filteredItems = items.filter((item) => {
    if (selectedStatus !== 'all' && item.moderationStatus !== selectedStatus) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchMake = item.make.toLowerCase().includes(q);
      const matchModel = item.model.toLowerCase().includes(q);
      const matchOwner = item.ownerLegalName.toLowerCase().includes(q);
      const matchArea = item.areaLabel.toLowerCase().includes(q);
      const matchPlate = item.plateMasked.toLowerCase().includes(q);
      return matchMake || matchModel || matchOwner || matchArea || matchPlate;
    }
    return true;
  });

  const handleSignOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    router.push('/sign-in');
    router.refresh();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#090A0C', color: '#F3F4F6' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid #1E232E',
          backgroundColor: '#101318',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#C89D46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#090A0C',
              }}
            >
              <Car size={18} />
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.02em' }}>
                MMG Operations
              </span>
              <span
                style={{
                  fontSize: '11px',
                  marginLeft: '8px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1E232E',
                  color: '#C89D46',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                }}
              >
                Fleet Desk
              </span>
            </div>
          </div>

          <nav style={{ display: 'flex', gap: '12px', marginLeft: '16px' }}>
            <Link
              href="/vehicles"
              style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#F3F4F6',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#181D26',
              }}
            >
              Vehicle Moderation
            </Link>
            <Link
              href="/owners"
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#9AA0A6',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              Owner Desk
            </Link>
            <Link
              href="/"
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#9AA0A6',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              Bookings & Trips
            </Link>
          </nav>
        </div>

        {/* Staff Profile & Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {staffEmail && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#F3F4F6' }}>
                {staffEmail}
              </div>
              <div style={{ fontSize: '10px', color: '#9AA0A6', textTransform: 'capitalize' }}>
                {staffRole || 'Staff Operator'}
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            title="Sign Out"
            style={{
              background: 'none',
              border: '1px solid #1E232E',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#9AA0A6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px' }}>
        {/* Page Title & Stats */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: '28px',
                fontWeight: '600',
                color: '#F9FAFB',
                margin: '0 0 6px 0',
              }}
            >
              Vehicle Moderation Queue
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#9AA0A6' }}>
              Review luxury executive specifications, verify multi-angle photos, and inspect garaged Lagos locations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                backgroundColor: '#101318',
                border: '1px solid #1E232E',
                borderRadius: '8px',
                padding: '10px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: '#EAB308', fontWeight: '600', textTransform: 'uppercase' }}>
                Pending Review
              </div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#F9FAFB' }}>
                {counts.pending_review}
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#101318',
                border: '1px solid #1E232E',
                borderRadius: '8px',
                padding: '10px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: '#4ADE80', fontWeight: '600', textTransform: 'uppercase' }}>
                Approved
              </div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#F9FAFB' }}>
                {counts.approved}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div
          style={{
            backgroundColor: '#101318',
            border: '1px solid #1E232E',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['all', 'pending_review', 'approved', 'rejected', 'suspended', 'draft'] as const).map((st) => {
              const isActive = selectedStatus === st;
              const label =
                st === 'all'
                  ? 'All Vehicles'
                  : STATUS_CONFIG[st as VehicleModerationStatus]?.label || st;
              return (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  style={{
                    backgroundColor: isActive ? '#C89D46' : '#181D26',
                    color: isActive ? '#090A0C' : '#9AA0A6',
                    border: '1px solid',
                    borderColor: isActive ? '#C89D46' : '#1E232E',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{label}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      backgroundColor: isActive ? 'rgba(0,0,0,0.2)' : '#1E232E',
                      color: isActive ? '#090A0C' : '#D1D5DB',
                    }}
                  >
                    {counts[st] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              width: '320px',
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6B7280',
              }}
            />
            <input
              type="text"
              placeholder="Search make, model, owner, plate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#181D26',
                border: '1px solid #1E232E',
                borderRadius: '6px',
                padding: '8px 12px 8px 36px',
                fontSize: '13px',
                color: '#F9FAFB',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Vehicle Table */}
        <div
          style={{
            backgroundColor: '#101318',
            border: '1px solid #1E232E',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#141820', borderBottom: '1px solid #1E232E', color: '#9AA0A6', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Vehicle Specification</th>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Category</th>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Owner Legal Name</th>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Lagos Base Area</th>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Daily Rate</th>
                <th style={{ padding: '14px 20px', fontWeight: '600' }}>Moderation Status</th>
                <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: '#6B7280' }}>
                    No vehicles found matching the active filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const statusInfo = STATUS_CONFIG[item.moderationStatus] || STATUS_CONFIG.draft;
                  const StatusIcon = statusInfo.icon;

                  return (
                    <tr
                      key={item.vehicleId}
                      style={{
                        borderBottom: '1px solid #181D26',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Vehicle Identity */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '48px',
                              height: '36px',
                              borderRadius: '4px',
                              backgroundColor: '#1E232E',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundImage: `url(${item.thumbnailUrl})`,
                              border: '1px solid #28303F',
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: '600', color: '#F9FAFB' }}>
                              {item.make} {item.model}
                            </div>
                            <div style={{ fontSize: '11px', color: '#9AA0A6' }}>
                              Year {item.year} · Plate: {item.plateMasked} · {item.imageCount} photos
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#181D26',
                            color: '#D1D5DB',
                            border: '1px solid #28303F',
                          }}
                        >
                          {item.category === 'executive_suv' ? 'Executive SUV' : 'Executive Sedan'}
                        </span>
                      </td>

                      {/* Owner */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ color: '#F3F4F6', fontWeight: '500' }}>{item.ownerLegalName}</div>
                        <div style={{ fontSize: '11px', color: '#6B7280' }}>ID: {item.ownerId.slice(0, 12)}…</div>
                      </td>

                      {/* Base Area */}
                      <td style={{ padding: '16px 20px', color: '#D1D5DB' }}>
                        {item.areaLabel}
                      </td>

                      {/* Daily Rate */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '600', color: '#C89D46' }}>
                          {formatNaira(item.dailyRateKobo)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6B7280' }}>
                          Net 85%: {formatNaira(Math.round(item.dailyRateKobo * 0.85))}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '4px 9px',
                            borderRadius: '4px',
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.text,
                          }}
                        >
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Inspect Button */}
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <Link
                          href={`/vehicles/${item.vehicleId}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#1E232E',
                            color: '#F9FAFB',
                            textDecoration: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            border: '1px solid #28303F',
                          }}
                        >
                          <Eye size={13} />
                          <span>Inspect</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #1E232E',
              backgroundColor: '#141820',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#9AA0A6',
            }}
          >
            <div>
              Showing {filteredItems.length} of {items.length} loaded records
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={isFirstPage}
                onClick={() => router.push('/vehicles')}
                style={{
                  backgroundColor: '#181D26',
                  color: isFirstPage ? '#4B5563' : '#F9FAFB',
                  border: '1px solid #1E232E',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  cursor: isFirstPage ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ChevronLeft size={14} />
                <span>First Page</span>
              </button>

              <button
                disabled={!hasMore || !nextCursor}
                onClick={() => nextCursor && router.push(`/vehicles?cursor=${nextCursor}`)}
                style={{
                  backgroundColor: '#181D26',
                  color: !hasMore ? '#4B5563' : '#F9FAFB',
                  border: '1px solid #1E232E',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  cursor: !hasMore ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>Next Page</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
