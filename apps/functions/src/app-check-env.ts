/**
 * Controls Firebase App Check enforcement.
 * Enforces App Check in production ('mmg-concierge').
 * Bypasses enforcement in development ('mmg-concierge-dev') and test environments
 * where Apple App Attest / Play Integrity is not configured, allowing native
 * TestFlight builds to execute callables without gateway rejection.
 */
export function isProductionAppCheck(): boolean {
  if (process.env.MMG_ENFORCE_APP_CHECK === "true") {
    return true;
  }
  if (process.env.MMG_ENFORCE_APP_CHECK === "false") {
    return false;
  }
  if (
    process.env.GCLOUD_PROJECT === "mmg-concierge" ||
    process.env.GOOGLE_CLOUD_PROJECT === "mmg-concierge"
  ) {
    return true;
  }
  if (process.env.FIREBASE_CONFIG) {
    try {
      const config = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: string };
      return config.projectId === "mmg-concierge";
    } catch {
      // Fall through
    }
  }
  return false;
}
