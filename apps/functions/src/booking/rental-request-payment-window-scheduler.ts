import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { FirestoreRentalRequestRepository } from './firestore-rental-request-repository.js';

export const expireRentalRequestPaymentWindows = onSchedule({
  schedule: 'every 5 minutes',
  region: 'europe-west1',
  timeZone: 'Africa/Lagos',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async () => {
  const result = await new FirestoreRentalRequestRepository().expirePaymentWindows(new Date());
  logger.info('rental_request.payment_window_expiry_scan', result);
});
