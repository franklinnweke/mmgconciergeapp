import type { CanonicalErrorCode } from '@mmg/contracts';

export class BookingCommandError extends Error {
  constructor(
    public readonly code: CanonicalErrorCode,
    message: string,
    public readonly safeDetails?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'BookingCommandError';
  }
}
