import { z } from 'zod';

import {
  boundedIdSchema,
  idempotencyKeySchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from '@mmg/contracts';

export const bookingCaseTypeSchema = z.enum(['owner_rejection', 'paid_conflict']);
export type BookingCaseType = z.infer<typeof bookingCaseTypeSchema>;

export const bookingCaseStatusSchema = z.enum([
  'open',
  'sourcing_alternative',
  'awaiting_renter',
  'resolved_alternative',
  'refund_pending',
  'refunded',
  'closed_no_action',
]);
export type BookingCaseStatus = z.infer<typeof bookingCaseStatusSchema>;

export const startBookingCaseSourcingDataSchema = z.object({
  caseId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export type StartBookingCaseSourcingData = z.infer<typeof startBookingCaseSourcingDataSchema>;

export const startBookingCaseSourcingCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: startBookingCaseSourcingDataSchema,
}).strict();
export type StartBookingCaseSourcingCommand = z.infer<typeof startBookingCaseSourcingCommandSchema>;

export const startBookingCaseSourcingResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    caseId: boundedIdSchema,
    fromStatus: z.literal('open'),
    toStatus: z.literal('sourcing_alternative'),
    version: z.number().int().positive(),
    updatedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type StartBookingCaseSourcingResult = z.infer<typeof startBookingCaseSourcingResultSchema>;
