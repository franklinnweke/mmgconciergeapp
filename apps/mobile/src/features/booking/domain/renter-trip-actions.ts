import { RenterTripActionUnavailableError } from '../data/renter-trip-action-gateway';
import type { RenterTrip, RenterTripAction } from './renter-trip';
import { isTerminalState, permittedRenterActions } from './renter-trip';

export type TripDetailMode = 'initializing' | 'missing' | 'preview' | 'offline' | 'ready';

export type RenterTripActionNotice = {
  tone: 'info' | 'warning';
  message: string;
};

export type RenterTripActionSession = {
  pendingAction: RenterTripAction | null;
  confirmingCancellation: boolean;
  notice: RenterTripActionNotice | null;
};

export const initialRenterTripActionSession: RenterTripActionSession = {
  pendingAction: null,
  confirmingCancellation: false,
  notice: null,
};

export function splitRenterTripActions(actions: readonly RenterTripAction[]): {
  primary: RenterTripAction | null;
  secondary: readonly RenterTripAction[];
} {
  const primary = actions.find((action) => action !== 'support') ?? actions[0] ?? null;
  return {
    primary,
    secondary: actions.filter((action) => action !== primary),
  };
}

export function tripDetailMode(input: {
  initializing: boolean;
  trip: RenterTrip | null;
  syncState: 'local-only' | 'syncing' | 'synced' | 'offline';
}): TripDetailMode {
  if (input.initializing) return 'initializing';
  if (!input.trip) return 'missing';
  if (input.trip.source === 'preview') return 'preview';
  if (input.syncState === 'offline') return 'offline';
  return 'ready';
}

export function noticeForActionResult(action: RenterTripAction, error: unknown): RenterTripActionNotice {
  if (error instanceof RenterTripActionUnavailableError) {
    return { tone: 'warning', message: error.message };
  }
  if (error) {
    return {
      tone: 'warning',
      message: action === 'payment'
        ? 'The payment request could not be started. No charge was attempted.'
        : action === 'cancellation'
          ? 'The cancellation request could not be sent. Your journey was not changed.'
          : 'The support request could not be sent. No message was sent and no journey state changed.',
    };
  }
  return { tone: 'info', message: 'Request received. Refresh this journey for its verified state.' };
}

export type RenterTripActionEvent =
  | { type: 'begin'; action: RenterTripAction }
  | { type: 'dismiss-cancellation' }
  | { type: 'start'; action: RenterTripAction }
  | { type: 'finish'; action: RenterTripAction; error?: unknown };

export function reduceRenterTripActionSession(
  state: RenterTripActionSession,
  event: RenterTripActionEvent,
): RenterTripActionSession {
  if (event.type === 'begin') {
    if (state.pendingAction) return state;
    if (event.action === 'cancellation') {
      return { ...state, confirmingCancellation: true, notice: null };
    }
    return { ...state, confirmingCancellation: false, notice: null };
  }
  if (event.type === 'dismiss-cancellation') {
    if (state.pendingAction) return state;
    return { ...state, confirmingCancellation: false };
  }
  if (event.type === 'start') {
    if (state.pendingAction) return state;
    return {
      pendingAction: event.action,
      confirmingCancellation: event.action === 'cancellation',
      notice: null,
    };
  }
  if (state.pendingAction && state.pendingAction !== event.action) return state;
  return {
    pendingAction: null,
    confirmingCancellation: false,
    notice: noticeForActionResult(event.action, event.error),
  };
}

export function tripDetailPresentation(trip: RenterTrip) {
  const actions = permittedRenterActions(trip.state);
  return {
    actions,
    ...splitRenterTripActions(actions),
    isTerminal: isTerminalState(trip.state),
  };
}
