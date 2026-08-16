'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OwnerVerificationStatus } from '@mmg/contracts';
import {
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  UserCheck,
} from 'lucide-react';

import type { OwnerVerificationListItem } from '../domain/types';

export type OwnerVerificationQueueProps = {
  items: OwnerVerificationListItem[];
  /** True when the server has at least one further page after `items`. */
  hasMore?: boolean;
  /** Cursor for the next page, or null on the last page. */
  nextCursor?: string | null;
  /** False once the operator has paged forward at least once. */
  isFirstPage?: boolean;
  staffEmail?: string;
  staffRole?: string;
};

const STATUS_CONFIG: Record<
  OwnerVerificationStatus,
  { label: string; bg: string; text: string; icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Draft', bg: '#1E222B', text: '#9AA0A6', icon: FileText },
  submitted: { label: 'Submitted', bg: 'rgba(234, 179, 8, 0.12)', text: '#EAB308', icon: Clock },
  under_review: { label: 'Under Review', bg: 'rgba(59, 130, 246, 0.12)', text: '#60A5FA', icon: UserCheck },
  approved: { label: 'Approved', bg: 'rgba(34, 197, 94, 0.12)', text: '#4ADE80', icon: CheckCircle2 },
  rejected: { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.12)', text: '#F87171', icon: XCircle },
  suspended: { label: 'Suspended', bg: 'rgba(249, 115, 22, 0.12)', text: '#FB923C', icon: AlertTriangle },
  revoked: { label: 'Revoked', bg: 'rgba(220, 38, 38, 0.18)', text: '#EF4444', icon: XCircle },
};

export function OwnerVerificationQueue({
  items,
  hasMore = false,
  nextCursor = null,
  isFirstPage = true,
  staffEmail,
  staffRole,
}: OwnerVerificationQueueProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OwnerVerificationStatus | 'all'>('all');

  const counts: Record<string, number> = {
    all: items.length,
    submitted: items.filter((i) => i.status === 'submitted').length,
    under_review: items.filter((i) => i.status === 'under_review').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    suspended: items.filter((i) => i.status === 'suspended').length,
    revoked: items.filter((i) => i.status === 'revoked').length,
    draft: items.filter((i) => i.status === 'draft').length,
  };

  const filteredItems = items.filter((item) => {
    if (selectedStatus !== 'all' && item.status !== selectedStatus) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.legalName.toLowerCase().includes(q);
      const matchEmail = item.emailMasked.toLowerCase().includes(q);
      const matchPhone = item.phoneMasked?.toLowerCase().includes(q);
      const matchArea = item.areaLabel?.toLowerCase().includes(q);
      const matchId = item.ownerId.toLowerCase().includes(q);
      return matchName || matchEmail || matchPhone || matchArea || matchId;
    }
    return true;
  });

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
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
              <ShieldCheck size={18} />
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
                Owner Desk
              </span>
            </div>
          </div>

          <nav style={{ display: 'flex', gap: '16px', marginLeft: '16px' }}>
            <Link
              href="/vehicles"
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#8E95A3',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              Vehicle Moderation
            </Link>
            <Link
              href="/owners"
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
              Owner Verification
            </Link>
            <Link
              href="/"
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#8E95A3',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              Bookings
            </Link>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#F3F4F6' }}>
              {staffEmail || 'Staff Operator'}
            </div>
            <div style={{ fontSize: '11px', color: '#7E8695' }}>{staffRole || 'verification_admin'}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#181D26',
              border: '1px solid #282F3D',
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#A0A8B8',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Title & Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>
              Owner Applications & Verification
            </h1>
            <p style={{ fontSize: '13px', color: '#8E95A3', margin: '4px 0 0' }}>
              Review government identification and approve Lagos vehicle hosts
            </p>
          </div>

          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#636A78' }} />
            <input
              type="text"
              placeholder="Search by name, email, phone, or area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 36px',
                backgroundColor: '#12151B',
                border: '1px solid #232936',
                borderRadius: '8px',
                color: '#F3F4F6',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'submitted', label: 'Submitted' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'suspended', label: 'Suspended' },
            { id: 'revoked', label: 'Revoked' },
            { id: 'draft', label: 'Draft' },
          ].map((tab) => {
            const isSelected = selectedStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStatus(tab.id as OwnerVerificationStatus | 'all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid #C89D46' : '1px solid #232936',
                  backgroundColor: isSelected ? 'rgba(200, 157, 70, 0.15)' : '#12151B',
                  color: isSelected ? '#C89D46' : '#8E95A3',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    backgroundColor: isSelected ? '#C89D46' : '#1E232E',
                    color: isSelected ? '#090A0C' : '#8E95A3',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: '700',
                  }}
                >
                  {counts[tab.id] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Verification Queue Table */}
        <div
          style={{
            backgroundColor: '#12151B',
            border: '1px solid #1E232E',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1E232E', backgroundColor: '#161A22', color: '#8E95A3' }}>
                <th style={{ padding: '14px 20px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Owner / Identity
                </th>
                <th style={{ padding: '14px 20px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Lagos Location
                </th>
                <th style={{ padding: '14px 20px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status
                </th>
                <th style={{ padding: '14px 20px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Submitted At
                </th>
                <th style={{ padding: '14px 20px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Updated
                </th>
                <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: '#636A78' }}>
                    No owner verification records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
                  const StatusIcon = statusInfo.icon;
                  const formattedSubmitted = item.submittedAt
                    ? new Date(item.submittedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const formattedUpdated = new Date(item.updatedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={item.ownerId}
                      style={{
                        borderBottom: '1px solid #1A1F29',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '600', color: '#FFFFFF' }}>{item.legalName}</div>
                        <div style={{ fontSize: '12px', color: '#8E95A3' }}>{item.emailMasked}</div>
                        {item.phoneMasked && (
                          <div style={{ fontSize: '11px', color: '#C89D46', fontFamily: 'monospace', marginTop: '2px' }}>
                            {item.phoneMasked}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '16px 20px', color: '#C5C9D3' }}>
                        {item.areaLabel || 'Lagos, Nigeria'}
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.text,
                            fontSize: '11px',
                            fontWeight: '600',
                          }}
                        >
                          <StatusIcon size={12} />
                          <span>{statusInfo.label}</span>
                        </span>
                      </td>

                      <td style={{ padding: '16px 20px', color: '#A0A8B8', fontSize: '12px' }}>
                        {formattedSubmitted}
                      </td>

                      <td style={{ padding: '16px 20px', color: '#7E8695', fontSize: '11px' }}>
                        {formattedUpdated}
                      </td>

                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <Link
                          href={`/owners/${item.ownerId}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: '#1E232E',
                            color: '#F3F4F6',
                            border: '1px solid #2B3242',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            textDecoration: 'none',
                          }}
                        >
                          <span>Inspect</span>
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — counts, search, and filters above apply to the loaded
            page only, so say so rather than implying a whole-collection view. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginTop: '16px',
            flexWrap: 'wrap',
          }}
        >
          <p style={{ fontSize: '12px', color: '#7E8695', margin: 0 }}>
            Showing {items.length} {items.length === 1 ? 'application' : 'applications'}
            {hasMore ? ' on this page. Counts and search cover the loaded page only.' : '.'}
          </p>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isFirstPage && (
              <Link
                href="/owners"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#12151B',
                  color: '#A0A8B8',
                  border: '1px solid #232936',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  textDecoration: 'none',
                }}
              >
                <ChevronLeft size={14} />
                <span>Newest</span>
              </Link>
            )}

            {hasMore && nextCursor && (
              <Link
                href={`/owners?cursor=${encodeURIComponent(nextCursor)}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#1E232E',
                  color: '#F3F4F6',
                  border: '1px solid #2B3242',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  textDecoration: 'none',
                }}
              >
                <span>Older</span>
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
