import { defineSecret } from 'firebase-functions/params';

/**
 * Server-side Google Maps Platform credential restricted to Places API (New).
 * Never exposed to mobile bundles or client network logs.
 */
export const googlePlacesSecret: ReturnType<typeof defineSecret> = defineSecret('GOOGLE_PLACES_API_KEY');
