import type { AdminBooking } from '../domain/admin-booking';

export class AdminGatewayUnavailableError extends Error {
  constructor() {
    super('Admin session-cookie authentication and trusted command routing are not connected.');
    this.name = 'AdminGatewayUnavailableError';
  }
}

export interface AdminBookingGateway {
  listBookings(): Promise<readonly AdminBooking[]>;
  confirmBooking(bookingId: string): Promise<AdminBooking>;
  rejectBooking(bookingId: string, reason: string): Promise<AdminBooking>;
}

export const unavailableAdminBookingGateway: AdminBookingGateway = {
  async listBookings() { throw new AdminGatewayUnavailableError(); },
  async confirmBooking() { throw new AdminGatewayUnavailableError(); },
  async rejectBooking() { throw new AdminGatewayUnavailableError(); },
};
