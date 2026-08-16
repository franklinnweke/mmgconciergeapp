import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { FirestoreAdminOwnerGateway, OWNER_QUEUE_PAGE_SIZE } from './firestore-admin-owner-gateway';

type FakeDoc = { id: string; data: Record<string, unknown> };

type QueryState = {
  wheres: Array<[string, string, unknown]>;
  orderBys: Array<[string, string]>;
  startAfterId: string | null;
  limit: number | null;
};

/**
 * Minimal in-memory stand-in for the Admin SDK query builder. It records the
 * calls the gateway makes so the test can assert the query is bounded, and it
 * applies filter/cursor/limit itself so pagination is exercised for real.
 */
function createFakeFirestore(docs: FakeDoc[]) {
  const calls: QueryState[] = [];

  function makeQuery(state: QueryState) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery({ ...state, wheres: [...state.wheres, [field, op, value]] });
      },
      orderBy(field: string, direction: string) {
        return makeQuery({ ...state, orderBys: [...state.orderBys, [field, direction]] });
      },
      startAfter(snapshot: { id: string }) {
        return makeQuery({ ...state, startAfterId: snapshot.id });
      },
      limit(count: number) {
        return makeQuery({ ...state, limit: count });
      },
      async get() {
        calls.push(state);
        let rows = docs;
        for (const [field, , value] of state.wheres) {
          rows = rows.filter((row) => row.data[field] === value);
        }
        if (state.startAfterId) {
          const index = rows.findIndex((row) => row.id === state.startAfterId);
          rows = index >= 0 ? rows.slice(index + 1) : rows;
        }
        if (state.limit !== null) {
          rows = rows.slice(0, state.limit);
        }
        return {
          docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
        };
      },
    };
  }

  const firestore = {
    collection() {
      return makeQuery({ wheres: [], orderBys: [], startAfterId: null, limit: null });
    },
    doc(path: string) {
      const id = path.split('/').pop();
      const found = docs.find((row) => row.id === id);
      return {
        async get() {
          return found
            ? { id: found.id, exists: true, data: () => found.data }
            : { id, exists: false, data: () => undefined };
        },
      };
    },
  };

  return { firestore, calls };
}

function ownerDoc(index: number, overrides: Record<string, unknown> = {}): FakeDoc {
  return {
    id: `owner-${String(index).padStart(3, '0')}`,
    data: {
      legalName: `Owner ${index}`,
      email: `owner${index}@example.com`,
      phoneE164: '+2348012346789',
      status: 'submitted',
      version: 1,
      updatedAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      ...overrides,
    },
  };
}

function createGateway(docs: FakeDoc[]) {
  const { firestore, calls } = createFakeFirestore(docs);
  const gateway = new FirestoreAdminOwnerGateway(
    firestore as unknown as FirebaseFirestore.Firestore,
    {} as never,
  );
  return { gateway, calls };
}

describe('FirestoreAdminOwnerGateway.listOwnerVerifications', () => {
  it('bounds the read even when no page size is supplied', async () => {
    const docs = Array.from({ length: 60 }, (_, i) => ownerDoc(i));
    const { gateway, calls } = createGateway(docs);

    const page = await gateway.listOwnerVerifications();

    expect(page.items).toHaveLength(OWNER_QUEUE_PAGE_SIZE);
    // Over-fetch by exactly one so `hasMore` needs no count query.
    expect(calls.at(-1)?.limit).toBe(OWNER_QUEUE_PAGE_SIZE + 1);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(docs[OWNER_QUEUE_PAGE_SIZE - 1]?.id);
  });

  it('orders by updatedAt descending so the queue is newest-first', async () => {
    const { gateway, calls } = createGateway([ownerDoc(1)]);
    await gateway.listOwnerVerifications();
    expect(calls.at(-1)?.orderBys).toEqual([['updatedAt', 'desc']]);
  });

  it('rejects an out-of-range page size instead of honouring it', async () => {
    const docs = Array.from({ length: 60 }, (_, i) => ownerDoc(i));
    const { gateway, calls } = createGateway(docs);

    await gateway.listOwnerVerifications({ pageSize: 100_000 });

    expect(calls.at(-1)?.limit).toBe(OWNER_QUEUE_PAGE_SIZE + 1);
  });

  it('pages forward through the cursor without repeating or skipping a row', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => ownerDoc(i));
    const { gateway } = createGateway(docs);

    const first = await gateway.listOwnerVerifications({ pageSize: 2 });
    expect(first.items.map((item) => item.ownerId)).toEqual(['owner-000', 'owner-001']);
    expect(first.hasMore).toBe(true);

    const second = await gateway.listOwnerVerifications({
      pageSize: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.ownerId)).toEqual(['owner-002', 'owner-003']);
    expect(second.hasMore).toBe(true);

    const third = await gateway.listOwnerVerifications({
      pageSize: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.items.map((item) => item.ownerId)).toEqual(['owner-004']);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it('applies the status filter to the query rather than in memory', async () => {
    const docs = [ownerDoc(1), ownerDoc(2, { status: 'approved' })];
    const { gateway, calls } = createGateway(docs);

    const page = await gateway.listOwnerVerifications({ status: 'approved' });

    expect(calls.at(-1)?.wheres).toEqual([['status', '==', 'approved']]);
    expect(page.items.map((item) => item.ownerId)).toEqual(['owner-002']);
  });

  it('ignores a cursor whose document no longer exists', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ownerDoc(i));
    const { gateway, calls } = createGateway(docs);

    const page = await gateway.listOwnerVerifications({ cursor: 'owner-deleted' });

    expect(calls.at(-1)?.startAfterId).toBeNull();
    expect(page.items).toHaveLength(3);
  });

  it('degrades one malformed row instead of failing the whole page', async () => {
    // `maskEmail`/`maskPhoneE164` throw on malformed input by design. A single
    // legacy or half-written document must not take the queue down.
    const docs = [
      ownerDoc(1),
      ownerDoc(2, { email: 'not-an-email', phoneE164: 'nope', legalName: '' }),
      ownerDoc(3, { email: undefined, phoneE164: null }),
    ];
    const { gateway } = createGateway(docs);

    const page = await gateway.listOwnerVerifications();

    expect(page.items).toHaveLength(3);
    expect(page.items[0]?.emailMasked).toContain('@');
    expect(page.items[1]?.emailMasked).toBe('unknown');
    expect(page.items[1]?.legalName).toBe('Unknown Owner');
    expect(page.items[2]?.emailMasked).toBe('unknown');
    expect(page.items[2]?.phoneMasked).toBeNull();
  });

  it('never leaks a raw email, phone, or storage path into a list row', async () => {
    const { gateway } = createGateway([ownerDoc(1)]);
    const page = await gateway.listOwnerVerifications();
    const serialised = JSON.stringify(page.items);

    expect(serialised).not.toContain('owner1@example.com');
    expect(serialised).not.toContain('+2348012346789');
    expect(serialised).not.toContain('private/owner-verification');
  });
});
