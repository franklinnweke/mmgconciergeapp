/**
 * Same-origin enforcement for cookie-authenticated mutation endpoints.
 *
 * The `__session` cookie is `SameSite=Lax`, which stops cross-site POSTs from
 * carrying it in current browsers but is not a substitute for an origin check:
 * Lax does not cover every navigation shape, and a same-site-but-different-host
 * subdomain still counts as same-site. These endpoints mint and clear staff
 * sessions, so they fail closed instead.
 *
 * Host resolution mirrors Next.js' own Server Action CSRF check
 * (`next/dist/server/app-render/action-handler.js`): prefer the first
 * `x-forwarded-host` value, fall back to `host`, and refuse when neither is
 * present. That keeps the check correct behind Firebase App Hosting and any
 * other reverse proxy that rewrites `Host`.
 */

/** Resolves the host this request was actually addressed to. */
export function resolveRequestHost(headers: Headers): string | null {
  const forwardedHost = headers.get('x-forwarded-host');
  const candidate = forwardedHost
    ? forwardedHost.split(',')[0]?.trim()
    : headers.get('host')?.trim();

  return candidate ? candidate : null;
}

export type SameOriginVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'unknown_host' | 'missing_origin' | 'invalid_origin' | 'cross_origin' };

/**
 * Decides whether a state-changing request originated from this deployment.
 *
 * Modern browsers send `Origin` on every same-origin `fetch` POST, so a missing
 * `Origin` is only accepted when `Sec-Fetch-Site: same-origin` proves the same
 * thing. Anything else — including a non-browser client that sends neither — is
 * rejected rather than waved through as "server-to-server".
 */
export function checkSameOrigin(headers: Headers): SameOriginVerdict {
  const host = resolveRequestHost(headers);
  if (!host) {
    return { allowed: false, reason: 'unknown_host' };
  }

  const origin = headers.get('origin');
  if (!origin) {
    return headers.get('sec-fetch-site') === 'same-origin'
      ? { allowed: true }
      : { allowed: false, reason: 'missing_origin' };
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { allowed: false, reason: 'invalid_origin' };
  }

  if (!originHost) {
    return { allowed: false, reason: 'invalid_origin' };
  }

  return originHost === host ? { allowed: true } : { allowed: false, reason: 'cross_origin' };
}

export class CrossOriginRequestError extends Error {
  constructor(readonly reason: Exclude<SameOriginVerdict, { allowed: true }>['reason']) {
    super('Request origin could not be verified.');
    this.name = 'CrossOriginRequestError';
  }
}

/** Throws {@link CrossOriginRequestError} unless the request is same-origin. */
export function assertSameOrigin(headers: Headers): void {
  const verdict = checkSameOrigin(headers);
  if (!verdict.allowed) {
    throw new CrossOriginRequestError(verdict.reason);
  }
}
