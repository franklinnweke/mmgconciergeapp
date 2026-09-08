import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { maskOperationalReference } from './live-admin-booking-case-repository';

describe('live booking intervention projection', () => {
  it('masks renter and owner identifiers before staff presentation', () => {
    expect(maskOperationalReference('firebase-user-abcdef123456')).toBe('••••123456');
    expect(maskOperationalReference('abc')).toBe('••••abc');
    expect(maskOperationalReference('')).toBe('••••••');
  });
});
