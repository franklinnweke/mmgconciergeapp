import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { FirestoreRenterCancellationRepository } from './firestore-renter-cancellation-repository.js';

export const resolveRenterCancellations = onSchedule({
  schedule: 'every 5 minutes',
  region: 'europe-west1',
  timeZone: 'Africa/Lagos',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async () => {
  const result = await new FirestoreRenterCancellationRepository().resolvePendingCancellations(new Date());
  logger.info('renter_cancellation.resolution_scan', result);
});
