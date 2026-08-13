import { VehicleSummary } from '@mmg/contracts';
import { ImageSource } from 'expo-image';

export const vehicleImages: Record<VehicleSummary['imageKey'], ImageSource> = {
  'graphite-sedan': require('../../../../assets/images/fleet/graphite-executive-sedan.png'),
  'hero-suv': require('../../../../assets/images/fleet/lagos-arrival-hero.png'),
  'pearl-suv': require('../../../../assets/images/fleet/pearl-executive-suv.png'),
};
