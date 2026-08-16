import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import { toNullableTimestamp, toTimestamp } from './firestore-owner-repository.js';

describe('owner Firestore timestamp adapter', () => {
  const fallback = new Date('2026-08-15T12:00:00.000Z');

  it('converts aggregate ISO values to Firestore Timestamp values', () => {
    const converted = toTimestamp('2026-08-14T12:00:00.000Z', fallback);
    expect(converted).toBeInstanceOf(Timestamp);
    expect(converted.toDate().toISOString()).toBe('2026-08-14T12:00:00.000Z');
  });

  it('preserves nested governmentId.uploadedAt Timestamp values and nulls', () => {
    const nested = toTimestamp(new Date('2026-08-13T12:00:00.000Z'), fallback);
    expect(nested).toBeInstanceOf(Timestamp);
    expect(toNullableTimestamp(null)).toBeNull();
    expect(toNullableTimestamp('2026-08-13T12:00:00.000Z')?.toDate().toISOString()).toBe(
      '2026-08-13T12:00:00.000Z',
    );
  });

  it('falls back only for malformed required timestamps', () => {
    expect(toTimestamp('not-a-date', fallback).toDate().toISOString()).toBe(
      fallback.toISOString(),
    );
  });
});
