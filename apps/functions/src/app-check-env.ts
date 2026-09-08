/**
 * Controls Firebase App Check enforcement.
 *
 * Production and unknown environments fail closed. The temporary bypass is
 * intentionally limited to the development Firebase project while native App
 * Attest / Play Integrity setup is being completed there.
 */
function configuredProjectId(): string | null {
  const direct =
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID;
  if (direct?.trim()) return direct.trim();

  if (process.env.FIREBASE_CONFIG) {
    try {
      const config = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: unknown };
      if (typeof config.projectId === 'string' && config.projectId.trim()) {
        return config.projectId.trim();
      }
    } catch {
      return null;
    }
  }

  return null;
}

function requestedEnforcement(): string | undefined {
  return process.env.MMG_APP_CHECK_ENFORCED ?? process.env.MMG_ENFORCE_APP_CHECK;
}

export function isProductionAppCheck(): boolean {
  const projectId = configuredProjectId();

  // Production can never be disabled by an environment override.
  if (projectId === 'mmg-concierge') return true;

  if (projectId === 'mmg-concierge-dev') {
    if (requestedEnforcement() === 'true') return true;
    // Development remains temporarily permissive unless explicitly enabled.
    return false;
  }

  // Staging, malformed configuration, and unidentified runtimes fail closed.
  return true;
}
