import { beforeEach, describe, expect, it } from 'vitest';
import type {
  MarkGovernmentIdClearedParams,
  MarkGovernmentIdClearedResult,
  OwnerRepository,
  StorageDeletionOutboxRecord,
} from './firestore-owner-repository.js';
import {
  getBackoffDelayMs,
  getNextRetryAt,
  processStorageDeletionOutboxService,
} from './process-storage-deletion-outbox-service.js';
import type { StorageGateway } from './storage-validation.js';

class InMemoryOwnerOutboxRepository implements OwnerRepository {
  records = new Map<string, StorageDeletionOutboxRecord & { id: string }>();
  clearedCalls: MarkGovernmentIdClearedParams[] = [];
  shouldMismatch = false;

  async runTransaction<T>(_work: any): Promise<T> {
    throw new Error('Not implemented for outbox test');
  }

  async getDueStorageDeletionOutboxRecords(
    now: Date,
    limit: number = 25,
  ): Promise<Array<StorageDeletionOutboxRecord & { id: string }>> {
    return Array.from(this.records.values())
      .filter((record) => {
        if (record.status !== 'pending') return false;
        const dueAt = record.nextAttemptAt ? new Date(record.nextAttemptAt) : new Date(0);
        return dueAt.getTime() <= now.getTime();
      })
      .sort((a, b) => {
        const aTime = a.nextAttemptAt ? new Date(a.nextAttemptAt).getTime() : 0;
        const bTime = b.nextAttemptAt ? new Date(b.nextAttemptAt).getTime() : 0;
        return aTime - bTime;
      })
      .slice(0, limit);
  }

  async updateStorageDeletionOutbox(
    recordId: string,
    update: Partial<StorageDeletionOutboxRecord>,
    _now: Date,
  ): Promise<void> {
    const existing = this.records.get(recordId);
    if (!existing) return;
    this.records.set(recordId, {
      ...existing,
      ...update,
    });
  }

  async markGovernmentIdCleared(
    params: MarkGovernmentIdClearedParams,
  ): Promise<MarkGovernmentIdClearedResult> {
    this.clearedCalls.push(params);
    if (this.shouldMismatch) {
      return { cleared: false, reason: 'target_mismatch' };
    }
    return { cleared: true };
  }
}

class InMemoryStorageGateway implements StorageGateway {
  deleted: string[] = [];
  shouldThrow = false;
  throwError = new Error('Simulated network failure');

  async getObjectMetadata(): Promise<null> {
    return null;
  }
  async readFirstBytes(): Promise<null> {
    return null;
  }
  async deleteObject(storagePath: string): Promise<void> {
    if (this.shouldThrow) {
      throw this.throwError;
    }
    this.deleted.push(storagePath);
  }
}

describe('processStorageDeletionOutboxService', () => {
  let repository: InMemoryOwnerOutboxRepository;
  let storageGateway: InMemoryStorageGateway;
  const baseTime = new Date('2026-09-14T12:00:00Z');

  beforeEach(() => {
    repository = new InMemoryOwnerOutboxRepository();
    storageGateway = new InMemoryStorageGateway();
  });

  it('calculates capped exponential backoff', () => {
    expect(getBackoffDelayMs(1)).toBe(60 * 1000);
    expect(getBackoffDelayMs(2)).toBe(5 * 60 * 1000);
    expect(getBackoffDelayMs(3)).toBe(15 * 60 * 1000);
    expect(getBackoffDelayMs(4)).toBe(30 * 60 * 1000);
    expect(getBackoffDelayMs(5)).toBe(60 * 60 * 1000);
    expect(getBackoffDelayMs(100)).toBe(60 * 60 * 1000);
    expect(getNextRetryAt(baseTime, 1)).toBe('2026-09-14T12:01:00.000Z');
  });

  it('successfully retries a due deletion and marks the durable job completed', async () => {
    repository.records.set('doc-1', {
      id: 'doc-1',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 1,
      lastAttemptAt: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(),
      nextAttemptAt: new Date(baseTime.getTime() - 5 * 60 * 1000).toISOString(),
      error: 'Initial error',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      retryScheduledCount: 0,
    });
    expect(storageGateway.deleted).toContain('private/owner-verification/owner-1/upload-1');
    expect(repository.clearedCalls).toHaveLength(1);
    expect(repository.records.get('doc-1')).toMatchObject({
      status: 'completed',
      completedAt: baseTime.toISOString(),
      error: '',
    });
  });

  it('does not process a future job while still processing a later due job', async () => {
    repository.records.set('future', {
      id: 'future',
      ownerId: 'owner-future',
      uploadId: 'upload-future',
      storagePath: 'private/owner-verification/owner-future/upload-future',
      attempts: 20,
      lastAttemptAt: baseTime.toISOString(),
      nextAttemptAt: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
      error: 'Cooling down',
      status: 'pending',
    });
    repository.records.set('due', {
      id: 'due',
      ownerId: 'owner-due',
      uploadId: 'upload-due',
      storagePath: 'private/owner-verification/owner-due/upload-due',
      attempts: 0,
      lastAttemptAt: baseTime.toISOString(),
      nextAttemptAt: baseTime.toISOString(),
      error: '',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
    });

    expect(result.processedCount).toBe(1);
    expect(storageGateway.deleted).toEqual([
      'private/owner-verification/owner-due/upload-due',
    ]);
    expect(repository.records.get('future')?.status).toBe('pending');
  });

  it('keeps failed deletions pending indefinitely and schedules the next retry', async () => {
    storageGateway.shouldThrow = true;
    storageGateway.throwError = new Error('Permission denied by GCS');

    repository.records.set('doc-fail', {
      id: 'doc-fail',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 99,
      lastAttemptAt: new Date(baseTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      nextAttemptAt: new Date(baseTime.getTime() - 60 * 60 * 1000).toISOString(),
      error: 'Previous failure',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 0,
      retryScheduledCount: 1,
    });

    const updated = repository.records.get('doc-fail');
    expect(updated?.status).toBe('pending');
    expect(updated?.attempts).toBe(100);
    expect(updated?.error).toBe('Permission denied by GCS');
    expect(updated?.lastAttemptAt).toBe(baseTime.toISOString());
    expect(updated?.nextAttemptAt).toBe('2026-09-14T13:00:00.000Z');
  });

  it('marks the job completed after deleting old bytes even when Firestore now points at another upload', async () => {
    repository.shouldMismatch = true;
    repository.records.set('doc-race', {
      id: 'doc-race',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 1,
      lastAttemptAt: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(),
      nextAttemptAt: baseTime.toISOString(),
      error: 'Initial failure',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
    });

    expect(result.completedCount).toBe(1);
    expect(storageGateway.deleted).toContain('private/owner-verification/owner-1/upload-1');
    expect(repository.records.get('doc-race')?.status).toBe('completed');
  });
});
