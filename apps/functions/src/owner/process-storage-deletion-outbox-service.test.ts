import { describe, expect, it, beforeEach } from 'vitest';
import type {
  MarkGovernmentIdClearedParams,
  MarkGovernmentIdClearedResult,
  OwnerRepository,
  StorageDeletionOutboxRecord,
} from './firestore-owner-repository.js';
import {
  processStorageDeletionOutboxService,
  getBackoffDelayMs,
} from './process-storage-deletion-outbox-service.js';
import type { StorageGateway } from './storage-validation.js';

class InMemoryOwnerOutboxRepository implements OwnerRepository {
  records = new Map<string, StorageDeletionOutboxRecord & { id: string }>();
  clearedCalls: MarkGovernmentIdClearedParams[] = [];
  shouldMismatch = false;

  async runTransaction<T>(_work: any): Promise<T> {
    throw new Error('Not implemented for outbox test');
  }

  async getPendingStorageDeletionOutboxRecords(
    _limit?: number,
  ): Promise<Array<StorageDeletionOutboxRecord & { id: string }>> {
    return Array.from(this.records.values()).filter((r) => r.status === 'pending');
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

  it('calculates backoff delay correctly based on attempts', () => {
    expect(getBackoffDelayMs(1)).toBe(60 * 1000); // 1 min
    expect(getBackoffDelayMs(2)).toBe(5 * 60 * 1000); // 5 mins
    expect(getBackoffDelayMs(3)).toBe(15 * 60 * 1000); // 15 mins
    expect(getBackoffDelayMs(4)).toBe(30 * 60 * 1000); // 30 mins
    expect(getBackoffDelayMs(5)).toBe(60 * 60 * 1000); // 60 mins
  });

  it('successfully retries pending deletion and marks outbox completed', async () => {
    repository.records.set('doc-1', {
      id: 'doc-1',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 1,
      lastAttemptAt: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(), // 10 mins ago (passed 1 min backoff)
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
      failedCount: 0,
      skippedBackoffCount: 0,
    });

    expect(storageGateway.deleted).toContain('private/owner-verification/owner-1/upload-1');
    expect(repository.clearedCalls).toHaveLength(1);
    expect(repository.clearedCalls[0]).toMatchObject({
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
    });

    const updated = repository.records.get('doc-1');
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBe(baseTime.toISOString());
  });

  it('skips processing if backoff window has not elapsed', async () => {
    repository.records.set('doc-recent', {
      id: 'doc-recent',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 1,
      lastAttemptAt: new Date(baseTime.getTime() - 20 * 1000).toISOString(), // 20s ago, needs 60s
      error: 'Recent error',
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
      failedCount: 0,
      skippedBackoffCount: 1,
    });

    expect(storageGateway.deleted).toHaveLength(0);
    expect(repository.clearedCalls).toHaveLength(0);
    expect(repository.records.get('doc-recent')?.status).toBe('pending');
  });

  it('handles storage deletion failure by incrementing attempts and retaining pending status', async () => {
    storageGateway.shouldThrow = true;
    storageGateway.throwError = new Error('Permission denied by GCS');

    repository.records.set('doc-fail', {
      id: 'doc-fail',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 2,
      lastAttemptAt: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(),
      error: 'Previous failure',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
      maxAttempts: 5,
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 0,
      failedCount: 0,
      skippedBackoffCount: 0,
    });

    const updated = repository.records.get('doc-fail');
    expect(updated?.status).toBe('pending');
    expect(updated?.attempts).toBe(3);
    expect(updated?.error).toBe('Permission denied by GCS');
    expect(updated?.lastAttemptAt).toBe(baseTime.toISOString());
  });

  it('transitions to failed status when max attempts are exceeded', async () => {
    storageGateway.shouldThrow = true;
    storageGateway.throwError = new Error('Persistent failure');

    repository.records.set('doc-max', {
      id: 'doc-max',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 4,
      lastAttemptAt: new Date(baseTime.getTime() - 60 * 60 * 1000).toISOString(),
      error: 'Prior attempt 4 failure',
      status: 'pending',
    });

    const result = await processStorageDeletionOutboxService({
      repository,
      storageGateway,
      now: () => baseTime,
      maxAttempts: 5,
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 0,
      failedCount: 1,
      skippedBackoffCount: 0,
    });

    const updated = repository.records.get('doc-max');
    expect(updated?.status).toBe('failed');
    expect(updated?.attempts).toBe(5);
    expect(updated?.error).toBe('Persistent failure');
  });

  it('marks outbox completed even if target document was concurrently modified/mismatched', async () => {
    repository.shouldMismatch = true; // Simulating markGovernmentIdCleared returning { cleared: false, reason: 'target_mismatch' }

    repository.records.set('doc-race', {
      id: 'doc-race',
      ownerId: 'owner-1',
      uploadId: 'upload-1',
      storagePath: 'private/owner-verification/owner-1/upload-1',
      attempts: 1,
      lastAttemptAt: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(),
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

    const updated = repository.records.get('doc-race');
    expect(updated?.status).toBe('completed');
  });
});
