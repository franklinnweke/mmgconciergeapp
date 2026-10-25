import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), session: vi.fn(), role: vi.fn(), capability: vi.fn(), origin: vi.fn(), database: {} }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ origin: 'http://localhost' }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth/server/firebase-admin', () => ({ getAdminFirestore: () => mocks.database }));
vi.mock('@/features/auth/server/same-origin', () => ({ assertSameOrigin: mocks.origin }));
vi.mock('@/features/auth/server/session', () => ({ requireLiveStaffSession: mocks.session, staffActorRole: mocks.role, staffSessionHasCapability: mocks.capability }));
vi.mock('@mmg/functions-booking/confirm-rental-request-pickup', () => ({ confirmRentalRequestPickup: mocks.confirm }));
vi.mock('@mmg/functions-booking/firestore-rental-request-repository', () => ({ FirestoreRentalRequestRepository: class {} }));
vi.mock('@mmg/functions-booking/errors', async () => ({ BookingCommandError: (await import('@mmg/contracts')).CommandError }));
vi.mock('@mmg/functions-booking/rental-request-service', () => ({ approveRentalRequest: vi.fn(), declineRentalRequest: vi.fn(), openRentalRequestPaymentWindow: vi.fn() }));
import { executeRentalRequestAction } from './rental-request-action';

const input = { requestId: 'request-one', expectedVersion: 2, action: 'confirm_pickup' as const, confirmedPickupTime: '10:30' };
beforeEach(() => {
  vi.clearAllMocks(); delete process.env.MMG_ADMIN_FIXTURES;
  mocks.session.mockResolvedValue({ uid: 'staff-one', roles: ['support'] });
  mocks.role.mockReturnValue('support'); mocks.capability.mockReturnValue(true);
  mocks.confirm.mockResolvedValue({ state: 'approved', version: 3 });
});
describe('pickup-time Admin authorization boundary', () => {
  it('uses the live authorized staff identity and a stable command key', async () => {
    expect(await executeRentalRequestAction(input)).toMatchObject({ success: true, version: 3 });
    await executeRentalRequestAction(input);
    expect(mocks.confirm.mock.calls[0][0]).toEqual(mocks.confirm.mock.calls[1][0]);
    expect(mocks.confirm.mock.calls[0][1]).toEqual({ uid: 'staff-one', role: 'support' });
  });
  it('rejects missing authority and cross-origin requests before dispatch writes', async () => {
    mocks.capability.mockReturnValueOnce(false);
    expect((await executeRentalRequestAction(input)).success).toBe(false);
    mocks.origin.mockImplementationOnce(() => { throw new Error('cross origin'); });
    expect((await executeRentalRequestAction(input)).success).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('rejects invalid times and injected financial fields', async () => {
    expect((await executeRentalRequestAction({ ...input, confirmedPickupTime: '24:00' })).success).toBe(false);
    expect((await executeRentalRequestAction({ ...input, amountKobo: 0 } as typeof input)).success).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
