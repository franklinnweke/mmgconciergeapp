import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { FirestoreOwnerResponseSlaRepository } from './firestore-owner-response-sla-repository.js';
import { emitOwnerResponseSlaSignals } from './owner-response-sla-service.js';

export const emitOwnerResponseSlaAlerts = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west1',
    timeZone: 'Africa/Lagos',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async () => {
    const result = await emitOwnerResponseSlaSignals({
      repository: new FirestoreOwnerResponseSlaRepository(),
    });
    logger.info('booking.owner_response_sla_scan_completed', result);
  },
);
