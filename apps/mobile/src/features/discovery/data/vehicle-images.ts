import { VehicleSummary } from '@mmg/contracts';
import { ImageSource } from 'expo-image';

export const vehicleImages: Record<VehicleSummary['imageKey'], ImageSource> = {
  'graphite-sedan': require('../../../../assets/images/fleet/graphite-executive-sedan.png'),
  'hero-suv': require('../../../../assets/images/fleet/prado-250-obsidian-hero.png'),
  'pearl-suv': require('../../../../assets/images/fleet/prado-150-pearl.png'),
  'prado-graphite': require('../../../../assets/images/fleet/prado-150-graphite.png'),
};
