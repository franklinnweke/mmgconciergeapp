import { logger } from 'firebase-functions';
import type { OwnerRepository } from './firestore-owner-repository.js';
import type { StorageGateway } from './storage-validation.js';

export type ProcessStorageDeletionOutboxDependencies = {
  repository: OwnerRepository;
  storageGateway: StorageGateway;
  now?: () => Date;
  maxAttempts?: number;
};

export type ProcessStorageDeletionOutboxResult = {
  processedCount: number;
  completedCount: number;
  failedCount: number;
  skippedBackoffCount: number;
};

/**
 * Exponential backoff delays in milliseconds:
 * 1st retry: 1 min
 * 2nd retry: 5 mins
 * 3rd retry: 15 mins
 * 4th retry: 30 mins
 * 5th+ retry: 60 mins
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

export async function processStorageDeletionOutboxService(
  dependencies: ProcessStorageDeletionOutboxDependencies,
): Promise<ProcessStorageDeletionOutboxResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  const maxAttempts = dependencies.maxAttempts ?? 10;
  const repository = dependencies.repository;
  const storageGateway = dependencies.storageGateway;

  if (!repository.getPendingStorageDeletionOutboxRecords || !repository.updateStorageDeletionOutbox) {
    return { processedCount: 0, completedCount: 0, failedCount: 0, skippedBackoffCount: 0 };
  }

  const records = await repository.getPendingStorageDeletionOutboxRecords(25);
  let processedCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let skippedBackoffCount = 0;

  for (const record of records) {
    processedCount += 1;

    // Backoff check: if record was attempted recently, verify whether backoff delay has passed
    const lastAttempt = new Date(record.lastAttemptAt);
    if (!isNaN(lastAttempt.getTime()) && record.attempts >= 1) {
      const minDelay = getBackoffDelayMs(record.attempts);
      const elapsed = now.getTime() - lastAttempt.getTime();
      if (elapsed < minDelay) {
        skippedBackoffCount += 1;
        continue;
      }
    }

    try {
      // 1. Attempt Cloud Storage deletion (404 handled gracefully by deleteObject)
      if (storageGateway.deleteObject) {
        await storageGateway.deleteObject(record.storagePath);
      }

      // 2. Transactionally revalidate and mark document cleared
      if (repository.markGovernmentIdCleared) {
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
      }

      // 3. Mark outbox record completed
      await repository.updateStorageDeletionOutbox(
        record.id,
        {
          status: 'completed',
          completedAt: now.toISOString(),
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
      const isTerminalFailure = nextAttempts >= maxAttempts;
      const errorMessage = err instanceof Error ? err.message : String(err);

      await repository.updateStorageDeletionOutbox(
        record.id,
        {
          attempts: nextAttempts,
          lastAttemptAt: now.toISOString(),
          error: errorMessage.slice(0, 1024),
          status: isTerminalFailure ? 'failed' : 'pending',
        },
        now,
      );

      if (isTerminalFailure) {
        failedCount += 1;
        logger.error('storage_outbox.terminal_failure', {
          recordId: record.id,
          ownerId: record.ownerId,
          uploadId: record.uploadId,
          attempts: nextAttempts,
          error: errorMessage,
        });
      } else {
        logger.warn('storage_outbox.retry_failed', {
          recordId: record.id,
          ownerId: record.ownerId,
          uploadId: record.uploadId,
          attempts: nextAttempts,
          error: errorMessage,
        });
      }
    }
  }

  return { processedCount, completedCount, failedCount, skippedBackoffCount };
}
