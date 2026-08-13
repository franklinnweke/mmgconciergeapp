import { z } from 'zod';

export type AccountType = 'renter' | 'owner';

export const emailAddressSchema = z.string().trim().max(254, 'Email address is too long.').email('Enter a valid email address.').transform((email) => email.toLowerCase());
export const passwordSchema = z.string().min(8, 'Use at least 8 characters.').max(128, 'Password is too long.');
export const emailPasswordSignInSchema = z.object({ email: emailAddressSchema, password: passwordSchema });
export const emailPasswordRegistrationSchema = emailPasswordSignInSchema.extend({ displayName: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name is too long.') });

export type EmailPasswordSignIn = z.infer<typeof emailPasswordSignInSchema>;
export type EmailPasswordRegistration = z.infer<typeof emailPasswordRegistrationSchema>;

export type SessionUser = { uid: string; accountType: AccountType; displayName: string };
export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };
export interface AuthGateway { getCurrentSession(): Promise<SessionState>; }

export type VehicleCategory = 'executive_suv' | 'executive_sedan';
export type VehicleSummary = {
  id: string;
  displayName: string;
  category: VehicleCategory;
  areaLabel: string;
  seats: number;
  dailyRateKobo: number;
  distanceKm: number;
  chauffeurPolicy: 'included';
  deliveryPolicy: 'included';
  imageKey: 'hero-suv' | 'pearl-suv' | 'graphite-sedan';
};
export type VehicleSearchCriteria = { areaLabel?: string; category?: VehicleCategory; query?: string };
export interface DiscoveryGateway {
  getFeaturedVehicles(): Promise<readonly VehicleSummary[]>;
  searchVehicles(criteria: VehicleSearchCriteria): Promise<readonly VehicleSummary[]>;
}
