'use client';

import {
  AlertTriangle,
  CalendarDays,
  Car,
  Check,
  ChevronRight,
  Clock3,
  LayoutList,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import graphiteSedan from '../../../../../mobile/assets/images/fleet/graphite-executive-sedan.png';
import pearlSuv from '../../../../../mobile/assets/images/fleet/prado-150-pearl.png';
import { formatNairaFromKobo, type PaidBookingState } from '@mmg/domain';

import {
  AdminGatewayUnavailableError,
  unavailableAdminBookingGateway,
  type AdminBookingGateway,
} from '../data/admin-booking-gateway';
import { createFixtureAdminBookingGateway } from '../data/fixture-admin-booking-gateway';
import { permittedAdminActions, type AdminBooking } from '../domain/admin-booking';

type AdminDataMode = 'fixture' | 'unavailable';
type QueueFilter = 'all' | 'actionable' | 'intervention' | 'confirmed' | 'closed';

// Typed as an exhaustive record so adding a paid-booking state fails here, at
// the definition, rather than as an implicit `any` at each lookup site.
const statusCopy: Record<PaidBookingState, { label: string; tone: string }> = {
  paid_pending_owner: { label: 'OWNER RESPONSE DUE', tone: 'gold' },
  confirmed: { label: 'CONFIRMED', tone: 'green' },
  intervention_required: { label: 'INTERVENTION', tone: 'red' },
  cancelled: { label: 'CANCELLED', tone: 'muted' },
  refund_pending: { label: 'REFUND PENDING', tone: 'gold' },
  refunded: { label: 'REFUNDED', tone: 'muted' },
  in_progress: { label: 'IN PROGRESS', tone: 'green' },
  completion_pending: { label: 'COMPLETION REVIEW', tone: 'gold' },
  completed: { label: 'COMPLETED', tone: 'muted' },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00+01:00`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function vehicleImage(booking: AdminBooking): StaticImageData {
  return booking.vehicle.id === 'graphite-sedan' ? graphiteSedan : pearlSuv;
}

export function BookingOperations({ mode }: { mode: AdminDataMode }) {
  const gateway = useMemo<AdminBookingGateway>(() =>
    mode === 'fixture' ? createFixtureAdminBookingGateway() : unavailableAdminBookingGateway, [mode]);
  const [bookings, setBookings] = useState<readonly AdminBooking[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionState, setActionState] = useState<'idle' | 'confirming' | 'rejecting'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await gateway.listBookings();
      setBookings(records);
      setSelectedId((current) => current && records.some((record) => record.id === current)
        ? current
        : records[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof AdminGatewayUnavailableError
        ? loadError.message
        : 'The booking queue could not be loaded. Retry when the operations service is available.');
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadBookings(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBookings]);

  const filteredBookings = useMemo(() => bookings.filter((booking) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [
      booking.id,
      booking.renterReference,
      booking.vehicle.displayName,
      booking.vehicle.areaLabel,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
    const matchesDate = !startDate || booking.startDate >= startDate;
    const matchesFilter = filter === 'all' ||
      (filter === 'actionable' && permittedAdminActions(booking).length > 0) ||
      (filter === 'intervention' && booking.state === 'intervention_required') ||
      (filter === 'confirmed' &&
        ['confirmed', 'in_progress', 'completion_pending'].includes(booking.state)) ||
      (filter === 'closed' && ['cancelled', 'refunded', 'completed'].includes(booking.state));
    return matchesQuery && matchesDate && matchesFilter;
  }), [bookings, filter, query, startDate]);

  const selected = filteredBookings.find((booking) => booking.id === selectedId) ??
    filteredBookings[0] ?? null;
  const actionableCount = bookings.filter((booking) => permittedAdminActions(booking).length > 0).length;
  const interventionCount = bookings.filter((booking) => booking.state === 'intervention_required').length;

  async function runAction(action: 'confirm' | 'reject') {
    if (!selected || !permittedAdminActions(selected).includes(action)) {
      setActionError('This record is stale or no longer actionable. Refresh the queue.');
      return;
    }
    setActionState(action === 'confirm' ? 'confirming' : 'rejecting');
    setActionError(null);
    try {
      const updated = action === 'confirm'
        ? await gateway.confirmBooking(selected.id)
        : await gateway.rejectBooking(selected.id, rejectionReason);
      setBookings((current) => current.map((booking) => booking.id === updated.id ? updated : booking));
      setRejecting(false);
      setRejectionReason('');
    } catch (actionFailure) {
      setActionError(actionFailure instanceof AdminGatewayUnavailableError
        ? actionFailure.message
        : 'The booking command could not be completed. Refresh and try again.');
    } finally {
      setActionState('idle');
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="operations-shell">
        <aside className="sidebar">
          <div className="brand-lockup" aria-label="MMG Concierge Operations">
            <span className="brand-mark">MMG</span>
          </div>
          <nav aria-label="Operations navigation" className="primary-nav">
            <a aria-current="page" href="#queue"><LayoutList size={17} />Bookings<span className="nav-count">{bookings.length}</span></a>
            <Link href="/vehicles"><Car size={17} />Vehicle Moderation</Link>
            <Link href="/owners"><ShieldCheck size={17} />Owner Verification</Link>
          </nav>
        </aside>

        <main className="workspace" id="queue">
          <motion.header
            animate={{ opacity: 1, y: 0 }}
            className="workspace-header"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.35 }}
          >
            <div>
              <h1>Booking queue</h1>
            </div>
            <div className="header-status">
              <span className={`environment-dot ${mode === 'fixture' ? 'fixture' : ''}`} />
              <div><strong>{mode === 'fixture' ? 'Development fixtures' : 'Live access locked'}</strong><span>{mode === 'fixture' ? 'No production writes' : 'Session cookie required'}</span></div>
            </div>
          </motion.header>

          <section aria-label="Queue summary" className="summary-strip">
            <div><span>ACTION DUE</span><strong>{actionableCount}</strong><small>Verified, awaiting response</small></div>
            <div><span>INTERVENTION</span><strong>{interventionCount}</strong><small>Requires concierge review</small></div>
          </section>

          <div className="filters" aria-label="Booking filters">
            <label className="search-field"><Search size={17} /><span className="sr-only">Search bookings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, vehicle, renter reference" type="search" value={query} /></label>
            <label><SlidersHorizontal size={15} /><span className="sr-only">Status filter</span><select onChange={(event) => setFilter(event.target.value as QueueFilter)} value={filter}><option value="all">All states</option><option value="actionable">Action due</option><option value="intervention">Intervention</option><option value="confirmed">Confirmed</option><option value="closed">Closed</option></select></label>
            <label><CalendarDays size={15} /><span className="sr-only">Journeys starting after</span><input aria-label="Journeys starting after" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
            <button className="refresh-button" onClick={() => void loadBookings()} type="button"><RefreshCw size={15} />Refresh</button>
          </div>

          <div className="operations-grid">
            <section aria-busy={loading} aria-label="Booking queue" className="queue-panel">
              <div className="queue-head"><span>BOOKING</span><span>JOURNEY</span><span>VALUE</span><span>STATE</span></div>
              {loading ? <QueueLoading /> : error ? <QueueError error={error} onRetry={loadBookings} /> : filteredBookings.length === 0 ? <QueueEmpty /> : (
                <motion.div animate="show" className="queue-list" initial="hidden" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045 } } }}>
                  {filteredBookings.map((booking) => <BookingRow booking={booking} key={booking.id} onSelect={setSelectedId} selected={selectedId === booking.id} />)}
                </motion.div>
              )}
            </section>

            <AnimatePresence mode="wait">
              {selected ? (
                <motion.aside
                  animate={{ opacity: 1, x: 0 }}
                  aria-label={`Booking ${selected.id} details`}
                  className="inspector"
                  exit={{ opacity: 0, x: 12 }}
                  initial={{ opacity: 0, x: 12 }}
                  key={selected.id}
                  transition={{ duration: 0.22 }}
                >
                  <BookingInspector booking={selected} />
                  {actionError ? <div className="inline-error" role="alert"><AlertTriangle size={15} />{actionError}</div> : null}
                  {permittedAdminActions(selected).length ? (
                    <div className="action-dock">
                      <button className="secondary-action" disabled={actionState !== 'idle'} onClick={() => setRejecting(true)} type="button"><X size={16} />Reject to intervention</button>
                      <button className="primary-action" disabled={actionState !== 'idle'} onClick={() => void runAction('confirm')} type="button"><Check size={16} />{actionState === 'confirming' ? 'Confirming…' : 'Confirm booking'}</button>
                    </div>
                  ) : <div className="locked-action"><ShieldCheck size={17} /><span><strong>No action available</strong>This state is view-only or awaiting another trusted event.</span></div>}
                </motion.aside>
              ) : <EmptyInspector key="empty" />}
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence>
          {rejecting && selected ? (
            <motion.div animate={{ opacity: 1 }} className="modal-backdrop" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onKeyDown={(event) => { if (event.key === 'Escape') setRejecting(false); }} role="presentation">
              <motion.form animate={{ opacity: 1, scale: 1 }} aria-labelledby="reject-title" className="reject-dialog" initial={{ opacity: 0, scale: 0.97 }} onSubmit={(event) => { event.preventDefault(); void runAction('reject'); }} role="dialog">
                <div className="dialog-icon"><AlertTriangle size={20} /></div>
                <p className="eyebrow">SEND TO INTERVENTION</p>
                <h2 id="reject-title">Why can’t this booking proceed?</h2>
                <p>This does not claim a cancellation or refund. It creates a reasoned intervention state for concierge follow-up.</p>
                <label htmlFor="rejection-reason">Operational reason</label>
                <textarea autoFocus id="rejection-reason" maxLength={500} minLength={10} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Record the verified operational reason…" required value={rejectionReason} />
                <div className="dialog-meta"><span>10–500 characters</span><span>{rejectionReason.trim().length}/500</span></div>
                <div className="dialog-actions"><button onClick={() => setRejecting(false)} type="button">Keep booking</button><button className="danger-action" disabled={actionState !== 'idle'} type="submit">{actionState === 'rejecting' ? 'Sending…' : 'Send to intervention'}</button></div>
              </motion.form>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function BookingRow({ booking, selected, onSelect }: { booking: AdminBooking; selected: boolean; onSelect: (id: string) => void }) {
  const presentation = statusCopy[booking.state];
  return (
    <motion.button
      aria-pressed={selected}
      className="booking-row"
      onClick={() => onSelect(booking.id)}
      transition={{ duration: 0.2 }}
      type="button"
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
    >
      <span className="booking-identity"><Image alt="" height={48} src={vehicleImage(booking)} width={64} /><span><strong>{booking.id}</strong><small>{booking.vehicle.displayName}</small></span></span>
      <span className="journey-cell"><strong>{formatDate(booking.startDate)}</strong><small>{booking.vehicle.areaLabel}</small></span>
      <span className="value-cell"><strong>{formatNairaFromKobo(booking.priceSnapshot.renterTotalKobo)}</strong><small>{booking.priceSnapshot.chargedDays} days</small></span>
      <span className={`status-badge ${presentation.tone}`}><i />{presentation.label}</span>
      <ChevronRight aria-hidden="true" className="row-chevron" size={16} />
    </motion.button>
  );
}

function BookingInspector({ booking }: { booking: AdminBooking }) {
  const presentation = statusCopy[booking.state];
  return (
    <>
      <div className="inspector-visual"><Image alt={booking.vehicle.displayName} fill preload sizes="(max-width: 900px) 100vw, 390px" src={vehicleImage(booking)} /><div className="visual-overlay" /><span>{booking.vehicle.categoryLabel}</span></div>
      <div className="inspector-title"><div><p className="eyebrow">{booking.id}</p><h2>{booking.vehicle.displayName}</h2><span>{booking.renterReference} · {booking.vehicle.areaLabel}</span></div><div className={`status-badge ${presentation.tone}`}><i />{presentation.label}</div></div>
      <div className="journey-band"><div><span>PICKUP</span><strong>{formatDate(booking.startDate)}</strong></div><ChevronRight size={17} /><div><span>RETURN</span><strong>{formatDate(booking.endDate)}</strong></div></div>
      <section className="inspector-section"><div className="section-title"><span>VERIFIED PRICE</span><small>{booking.priceSnapshot.configVersion}</small></div><dl className="price-lines"><div><dt>Rental · {booking.priceSnapshot.chargedDays} days</dt><dd>{formatNairaFromKobo(booking.priceSnapshot.baseRentalKobo)}</dd></div><div><dt>Service and protection</dt><dd>{formatNairaFromKobo(booking.priceSnapshot.serviceFeeKobo)}</dd></div><div className="price-total"><dt>Renter total</dt><dd>{formatNairaFromKobo(booking.priceSnapshot.renterTotalKobo)}</dd></div><div><dt>Owner earnings</dt><dd>{formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)}</dd></div></dl></section>
      <section className="payment-evidence"><ShieldCheck size={19} /><div><span>PAYMENT EVIDENCE</span><strong>{booking.payment.status.replace('_', ' ').toUpperCase()} · {booking.payment.referenceSuffix}</strong><small>Verified {formatTimestamp(booking.payment.verifiedAt)}</small></div></section>
      <section className="inspector-section"><div className="section-title"><span>AUDIT TIMELINE</span><small>{booking.timeline.length} events</small></div><ol className="timeline">{booking.timeline.map((event, index) => <li key={event.id}><i className={index === booking.timeline.length - 1 ? 'current' : ''} /><div><strong>{event.eventType}</strong><span>{event.fromState ? `${event.fromState} → ` : ''}{event.toState}</span><small>{formatTimestamp(event.occurredAt)} · {event.actorType}</small></div></li>)}</ol></section>
    </>
  );
}

function QueueLoading() { return <div className="queue-state"><div className="loading-line" /><div className="loading-line" /><div className="loading-line" /><span>Loading trusted booking records…</span></div>; }
function QueueEmpty() { return <div className="queue-state"><Search size={22} /><strong>No bookings match these filters.</strong><span>Clear the search or widen the journey date.</span></div>; }
function QueueError({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) { return <div className="queue-state error-state"><ShieldCheck size={24} /><strong>Operations access is closed.</strong><span>{error}</span><button onClick={() => void onRetry()} type="button"><RefreshCw size={15} />Retry secure connection</button></div>; }
function EmptyInspector() { return <motion.aside animate={{ opacity: 1 }} className="inspector empty-inspector" initial={{ opacity: 0 }}><Clock3 size={24} /><strong>Select a booking</strong><span>Payment evidence, timeline, and legal next actions will appear here.</span></motion.aside>; }
