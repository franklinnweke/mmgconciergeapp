import { describe, expect, it } from 'vitest';

import {
  startBookingCaseSourcing,
  type BookingCaseSourcingRepository,
  type BookingCaseSourcingTransaction,
  type StoredBookingCaseIdempotency,
  type StoredBookingInterventionCase,
} from './booking-case-sourcing-service.js';

function harness(seed: StoredBookingInterventionCase = {
  caseId: 'case-123',
  type: 'owner_rejection',
  status: 'open',
  version: 1,
}) {
  let current = seed;
  const idempotency = new Map<string, StoredBookingCaseIdempotency>();
  const domainAudits: unknown[] = [];
  const adminAudits: unknown[] = [];

  const transaction: BookingCaseSourcingTransaction = {
    getIdempotency: async (id) => idempotency.get(id) ?? null,
    getCase: async (id) => id === current.caseId ? current : null,
    updateCase: ({ version }) => {
      current = { ...current, status: 'sourcing_alternative', version };
    },
    createDomainAudit: (input) => domainAudits.push(input),
    createAdminAudit: (input) => adminAudits.push(input),
    saveIdempotency: ({ documentId, requestHash, result }) => {
      idempotency.set(documentId, { requestHash, result });
    },
  };
  const repository: BookingCaseSourcingRepository = {
    runTransaction: async (work) => work(transaction),
  };

  return {
    repository,
    current: () => current,
    domainAudits,
    adminAudits,
  };
}

const support = { uid: 'support-123', role: 'support' as const };
const command = {
  schemaVersion: 1 as const,
  idempotencyKey: 'case-sourcing-command-0001',
  data: { caseId: 'case-123', expectedVersion: 1 },
};

describe('startBookingCaseSourcing', () => {
  it('moves only open case status to sourcing_alternative and writes both audit layers', async () => {
    const state = harness();
    const result = await startBookingCaseSourcing(command, support, {
      repository: state.repository,
      now: () => new Date('2026-09-01T13:00:00.000Z'),
      createRequestId: () => 'request-case-123',
    });

    expect(result).toEqual({
      requestId: 'request-case-123',
      result: {
        caseId: 'case-123',
        fromStatus: 'open',
        toStatus: 'sourcing_alternative',
        version: 2,
        updatedAt: '2026-09-01T13:00:00.000Z',
      },
    });
    expect(state.current()).toMatchObject({ status: 'sourcing_alternative', version: 2 });
    expect(state.domainAudits).toHaveLength(1);
    expect(state.adminAudits).toHaveLength(1);
  });

  it('supports paid_conflict cases without changing any payment/booking economics', async () => {
    const state = harness({
      caseId: 'case-123',
      type: 'paid_conflict',
      status: 'open',
      version: 1,
    });
    await expect(startBookingCaseSourcing(command, support, {
      repository: state.repository,
    })).resolves.toMatchObject({
      result: { toStatus: 'sourcing_alternative' },
    });
  });

  it('fails stale or non-open cases before any audit effect', async () => {
    const stale = harness();
    await expect(startBookingCaseSourcing({
      ...command,
      data: { caseId: 'case-123', expectedVersion: 2 },
    }, support, { repository: stale.repository })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });
    expect(stale.domainAudits).toHaveLength(0);

    const progressed = harness({
      caseId: 'case-123',
      type: 'owner_rejection',
      status: 'sourcing_alternative',
      version: 2,
    });
    await expect(startBookingCaseSourcing({
      ...command,
      data: { caseId: 'case-123', expectedVersion: 2 },
    }, support, { repository: progressed.repository })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    expect(progressed.adminAudits).toHaveLength(0);
  });

  it('replays the same command without a second case/audit transition', async () => {
    const state = harness();
    const first = await startBookingCaseSourcing(command, support, {
      repository: state.repository,
      createRequestId: () => 'request-first',
    });
    const replay = await startBookingCaseSourcing(command, support, {
      repository: state.repository,
      createRequestId: () => 'request-second',
    });

    expect(replay).toEqual(first);
    expect(state.domainAudits).toHaveLength(1);
    expect(state.adminAudits).toHaveLength(1);
  });

  it('rejects client attempts to smuggle financial or resolution fields into the command', async () => {
    const state = harness();
    await expect(startBookingCaseSourcing({
      ...command,
      data: {
        caseId: 'case-123',
        expectedVersion: 1,
        refundAmountKobo: 100,
      },
    }, support, { repository: state.repository })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(state.domainAudits).toHaveLength(0);
  });
});
