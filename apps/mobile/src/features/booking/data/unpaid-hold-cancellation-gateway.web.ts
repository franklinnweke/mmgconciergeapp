export async function cancelUnpaidHold(_intentId: string): Promise<never> {
  throw new Error('Cancel held dates in the native app. This preview does not change live bookings.');
}
