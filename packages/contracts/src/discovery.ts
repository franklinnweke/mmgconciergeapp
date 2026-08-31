import { z } from 'zod';

import {
  dateOnlySchema,
  renterVisibleVehicleSchema,
  vehicleCategorySchema,
  type VehicleSummary,
} from './index.js';

const discoveryVehicleIdSchema = z.string().trim().min(1).max(128);

/** Renter discovery never exposes the persistent owner account identifier. */
export const discoveryVehicleSchema = renterVisibleVehicleSchema
  .omit({ ownerId: true })
  .strict();
export type DiscoveryVehicle = z.infer<typeof discoveryVehicleSchema>;

export const rankedDiscoveryVehicleSchema = discoveryVehicleSchema.extend({
  distanceKm: z.number().nonnegative().max(500),
}).strict();
export type RankedDiscoveryVehicle = z.infer<typeof rankedDiscoveryVehicleSchema>;

export const searchVehiclesDataSchema = z.object({
  query: z.string().trim().max(80).optional(),
  category: vehicleCategorySchema.optional(),
  areaLabel: z.string().trim().max(120).optional(),
  minSeats: z.number().int().min(2).max(8).optional(),
  minPriceKobo: z.number().int().nonnegative().optional(),
  maxPriceKobo: z.number().int().nonnegative().optional(),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(100).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
}).strict();
export type SearchVehiclesData = z.infer<typeof searchVehiclesDataSchema>;

export const searchVehiclesResultSchema = z.object({
  vehicles: z.array(rankedDiscoveryVehicleSchema).max(100),
  totalMatches: z.number().int().nonnegative().max(100),
}).strict();
export type SearchVehiclesResult = z.infer<typeof searchVehiclesResultSchema>;

export const getVehicleDetailsDataSchema = z.object({
  vehicleId: discoveryVehicleIdSchema,
}).strict();
export type GetVehicleDetailsData = z.infer<typeof getVehicleDetailsDataSchema>;

export const getVehicleDetailsResultSchema = z.object({
  vehicle: discoveryVehicleSchema.nullable(),
}).strict();
export type GetVehicleDetailsResult = z.infer<typeof getVehicleDetailsResultSchema>;

export function discoveryVehicleToSummary(
  vehicle: DiscoveryVehicle,
  distanceKm = 0,
): VehicleSummary {
  return {
    id: vehicle.vehicleId,
    displayName: vehicle.displayName,
    category: vehicle.category,
    areaLabel: vehicle.areaLabel,
    seats: vehicle.seats,
    dailyRateKobo: vehicle.ownerDailyRateKobo,
    distanceKm,
    chauffeurPolicy: vehicle.chauffeurPolicy,
    deliveryPolicy: vehicle.deliveryPolicy,
    imageUrl: vehicle.primaryImageUrl,
    primaryImageUrl: vehicle.primaryImageUrl,
    imageUrls: vehicle.imageUrls,
    description: vehicle.description,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  };
}
