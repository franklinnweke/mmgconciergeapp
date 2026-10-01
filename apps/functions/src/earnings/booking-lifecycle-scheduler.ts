import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { progressBookingLifecycle as progressBookingLifecycleService } from './owner-earnings-service.js';

export const progressBookingLifecycle = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    timeZone: 'Africa/Lagos',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async () => {
    const result = await progressBookingLifecycleService();
    logger.info('booking.lifecycle_progression_scan', result);
  },
);
