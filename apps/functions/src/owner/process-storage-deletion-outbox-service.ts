import { logger } from 'firebase-functions';
import type { OwnerRepository } from './firestore-owner-repository.js';
import type { StorageGateway } from './storage-validation.js';

export type ProcessStorageDeletionOutboxDependencies = {
  repository: OwnerRepository;
  storageGateway: StorageGateway;
  now?: () => Date;
};

export type ProcessStorageDeletionOutboxResult = {
  processedCount: number;
  completedCount: number;
  retryScheduledCount: number;
};

/**
 * Exponential backoff delays in milliseconds:
 * 1st retry: 1 min
 * 2nd retry: 5 mins
 * 3rd retry: 15 mins
 * 4th retry: 30 mins
 * 5th+ retry: 60 mins
 *
 * Retries are intentionally unbounded. Government-ID retention is a deletion
 * obligation, so repeated infrastructure failures must never make a record
 * permanently ineligible for cleanup.
 */
export function getBackoffDelayMs(attempts: number): number {
  switch (attempts) {
    case 1:
      return 60 * 1000;
    case 2:
      return 5 * 60 * 1000;
    case 3:
      return 15 * 60 * 1000;
    case 4:
      return 30 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}

export function getNextRetryAt(now: Date, attempts: number): string {
  return new Date(now.getTime() + getBackoffDelayMs(attempts)).toISOString();
}

export async function processStorageDeletionOutboxService(
  dependencies: ProcessStorageDeletionOutboxDependencies,
): Promise<ProcessStorageDeletionOutboxResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  const repository = dependencies.repository;
  const storageGateway = dependencies.storageGateway;

  if (
    !repository.getDueStorageDeletionOutboxRecords ||
    !repository.updateStorageDeletionOutbox ||
    !repository.markGovernmentIdCleared
  ) {
    throw new Error('Storage deletion outbox repository capabilities are not configured.');
  }
  if (!storageGateway.deleteObject) {
    throw new Error('Storage deletion gateway is not configured.');
  }

  const records = await repository.getDueStorageDeletionOutboxRecords(now, 25);
  let processedCount = 0;
  let completedCount = 0;
  let retryScheduledCount = 0;

  for (const record of records) {
    processedCount += 1;

    try {
      // 1. Delete the exact object. AdminStorageGateway treats not-found as success.
      await storageGateway.deleteObject(record.storagePath);

      // 2. Revalidate the exact upload target before clearing Firestore metadata.
      // If the owner record has moved on to another upload, the old bytes are still
      // gone and the outbox item can safely complete without touching the new upload.
      const clearedResult = await repository.markGovernmentIdCleared({
        ownerId: record.ownerId,
        uploadId: record.uploadId,
        storagePath: record.storagePath,
        now,
      });
      if (!clearedResult.cleared) {
        logger.info('storage_outbox.document_not_cleared_safely', {
          ownerId: record.ownerId,
          uploadId: record.uploadId,
          reason: clearedResult.reason,
        });
      }

      // 3. Complete the durable outbox record only after the storage operation.
      await repository.updateStorageDeletionOutbox(
        record.id,
        {
          status: 'completed',
          completedAt: now.toISOString(),
          error: '',
        },
        now,
      );
      completedCount += 1;

      logger.info('storage_outbox.deletion_completed', {
        recordId: record.id,
        ownerId: record.ownerId,
        uploadId: record.uploadId,
      });
    } catch (err) {
      const nextAttempts = record.attempts + 1;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = getNextRetryAt(now, nextAttempts);

      await repository.updateStorageDeletionOutbox(
        record.id,
        {
          attempts: nextAttempts,
          lastAttemptAt: now.toISOString(),
          nextAttemptAt,
          error: errorMessage.slice(0, 1024),
          status: 'pending',
        },
        now,
      );
      retryScheduledCount += 1;

      const context = {
        recordId: record.id,
        ownerId: record.ownerId,
        uploadId: record.uploadId,
        attempts: nextAttempts,
        nextAttemptAt,
        error: errorMessage,
      };
      if (nextAttempts >= 10) {
        logger.error('storage_outbox.repeated_failure', context);
      } else {
        logger.warn('storage_outbox.retry_failed', context);
      }
    }
  }

  return { processedCount, completedCount, retryScheduledCount };
}
