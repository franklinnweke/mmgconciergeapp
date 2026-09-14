import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { FirestoreOwnerRepository } from './firestore-owner-repository.js';
import { processStorageDeletionOutboxService } from './process-storage-deletion-outbox-service.js';
import { AdminStorageGateway } from './storage-validation.js';

export const processStorageDeletionOutbox = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west1',
    timeZone: 'Africa/Lagos',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    logger.info('storage_outbox.process_started');
    const result = await processStorageDeletionOutboxService({
      repository: new FirestoreOwnerRepository(),
      storageGateway: new AdminStorageGateway(),
    });
    logger.info('storage_outbox.process_finished', result);
  },
);
