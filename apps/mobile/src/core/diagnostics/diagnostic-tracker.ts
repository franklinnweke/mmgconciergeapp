let customExpoConfig: {
  extra?: Record<string, unknown>;
  ios?: { buildNumber?: string };
  version?: string;
} | null = null;

export function setDiagnosticExpoConfigForTesting(config: typeof customExpoConfig): void {
  customExpoConfig = config;
}

function getExpoConfig(): {
  extra?: Record<string, unknown>;
  ios?: { buildNumber?: string };
  version?: string;
} | undefined {
  if (customExpoConfig !== null) {
    return customExpoConfig;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants');
    return (Constants.default ?? Constants).expoConfig;
  } catch {
    return undefined;
  }
}

export type DiagnosticBreadcrumb = {
  category: string;
  data?: Record<string, unknown>;
  message: string;
  timestamp: string;
};

export type DiagnosticSnapshot = {
  authPhase: string;
  breadcrumbs: readonly DiagnosticBreadcrumb[];
  currentRoute: string;
  incidentId: string;
  segments: readonly string[];
  timestamp: string;
};

const MAX_BREADCRUMBS = 30;

let currentRoute = 'unknown';
let currentSegments: readonly string[] = [];
let currentAuthPhase = 'uninitialized';
let breadcrumbBuffer: DiagnosticBreadcrumb[] = [];

const DYNAMIC_ROUTE_PARENTS = new Set([
  'bookings',
  'fleet',
  'owner-bookings',
  'payments',
  'rentalRequests',
  'requests',
  'trip',
  'users',
  'vehicle',
]);

export function sanitizeRouteSegment(segment: string, isDynamicChild?: boolean): string {
  if (!segment) return segment;
  if (isDynamicChild) {
    return '[REDACTED_ID]';
  }
  let text = sanitizeDiagnosticText(segment);
  text = text.replace(PREFIXED_ID_REGEX, '[REDACTED_ID]');
  if (/^[a-zA-Z0-9_-]{16,}$/.test(text) && /[0-9]/.test(text) && /[a-zA-Z]/.test(text)) {
    return '[REDACTED_ID]';
  }
  return text;
}

export function sanitizeSegments(segments: readonly string[]): readonly string[] {
  return segments.map((seg, index) => {
    const prev = index > 0 ? segments[index - 1] : undefined;
    const isDynamicChild = Boolean(prev && DYNAMIC_ROUTE_PARENTS.has(prev));
    return sanitizeRouteSegment(seg, isDynamicChild);
  });
}

export function sanitizeRoute(route: string): string {
  if (!route) return '/';
  let text = sanitizeDiagnosticText(route);
  text = text.replace(PREFIXED_ID_REGEX, '[REDACTED_ID]');
  text = text.replace(PATH_ID_REGEX, '$1/[REDACTED_ID]');
  text = text.replace(/\/([a-zA-Z0-9_-]{16,})(?=\/|$)/g, '/[REDACTED_ID]');
  return text;
}

export function recordNavigation(route: string, segments: readonly string[] = []): void {
  currentRoute = sanitizeRoute(route || '/');
  currentSegments = sanitizeSegments(segments);
  recordBreadcrumb('nav', `route: ${currentRoute}`, { segments: [...currentSegments] });
}

export function recordAuthPhase(phase: string): void {
  currentAuthPhase = phase;
  recordBreadcrumb('auth', `phase: ${phase}`);
}

export function recordBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const sanitizedData = data ? sanitizeObject(data) : undefined;
  const entry: DiagnosticBreadcrumb = {
    category,
    data: sanitizedData,
    message: sanitizeDiagnosticText(message),
    timestamp: new Date().toISOString(),
  };

  breadcrumbBuffer.push(entry);
  if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbBuffer.shift();
  }
}

export function getDiagnosticSnapshot(): DiagnosticSnapshot {
  const now = new Date();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const incidentId = `INC-${now.getTime().toString(36).toUpperCase()}-${randomSuffix}`;

  return {
    authPhase: currentAuthPhase,
    breadcrumbs: [...breadcrumbBuffer],
    currentRoute,
    incidentId,
    segments: [...currentSegments],
    timestamp: now.toISOString(),
  };
}

export function clearDiagnosticState(): void {
  currentRoute = 'unknown';
  currentSegments = [];
  currentAuthPhase = 'uninitialized';
  breadcrumbBuffer = [];
  customExpoConfig = null;
}

export function isDiagnosticModeEnabled(): boolean {
  const expoConfig = getExpoConfig();
  const extra = expoConfig?.extra;
  const env = extra?.firebaseEnvironment;
  const diagnosticsFlag = extra?.diagnosticsEnabled === true || extra?.diagnosticsEnabled === 'true';

  // Never enable in production Firebase environment
  if (env === 'production') {
    return false;
  }

  // Local __DEV__ is enabled for developer convenience (unless in production Firebase)
  if (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) {
    return true;
  }

  // For non-__DEV__ builds (e.g. TestFlight binaries), require STRICTLY:
  // 1. firebaseEnvironment === 'development'
  // 2. explicit diagnostic flag enabled
  return env === 'development' && diagnosticsFlag === true;
}

export function getBuildInfo(): {
  buildNumber: string;
  commit: string | null;
  env: string;
  version: string;
} {
  const expoConfig = getExpoConfig();
  const extra = expoConfig?.extra;
  const version = expoConfig?.version ?? '1.0.0';
  const buildNumber = expoConfig?.ios?.buildNumber ?? 'unknown';
  const commit = (extra?.easBuildCommit as string | undefined) ?? null;
  const env = (extra?.firebaseEnvironment as string | undefined)
    ?? (typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'unknown');

  return {
    buildNumber,
    commit,
    env,
    version,
  };
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const NIGERIAN_PHONE_REGEX = /(?:\+?234|0)[789][01]\d{8}/g;
const INTERNATIONAL_PHONE_REGEX = /\+[1-9]\d{7,14}/g;
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi;
const JWT_REGEX = /eyJ[a-zA-Z0-9-_=]+\.eyJ[a-zA-Z0-9-_=]+/g;
const PATH_ID_REGEX = /\b(users|renterProfiles|ownerProfiles|rentalRequests|rentalRequestContacts|bookings|payments|owner-bookings|fleet|vehicle|trip|requests)\/[a-zA-Z0-9_-]+/g;
const PREFIXED_ID_REGEX = /\b(usr|user|req|request|bk|booking|veh|vehicle|trip|pay|payment)_[a-zA-Z0-9_-]+\b/gi;
const IDENTITY_KEY_VALUE_REGEX = /\b(uid|userId|renterId|ownerId)(\s*[:=]\s*)["']?(?!(?:null|undefined)\b)[a-zA-Z0-9_-]+["']?/gi;

export function sanitizeDiagnosticText(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(NIGERIAN_PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(INTERNATIONAL_PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(JWT_REGEX, '[REDACTED_JWT]')
    .replace(IDENTITY_KEY_VALUE_REGEX, '$1$2[REDACTED_ID]')
    .replace(PATH_ID_REGEX, '$1/[REDACTED_ID]')
    .replace(PREFIXED_ID_REGEX, '[REDACTED_ID]');
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let text = sanitizeDiagnosticText(value);
    text = text.replace(PREFIXED_ID_REGEX, '[REDACTED_ID]');
    if (/^[a-zA-Z0-9_-]{16,}$/.test(text) && /[0-9]/.test(text) && /[a-zA-Z]/.test(text)) {
      return '[REDACTED_ID]';
    }
    return text;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEY_PATTERN = /password|secret|token|credential|auth|email|phone|address|lat|lng|coord|uid|userId|renterId|ownerId/i;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeValue(value);
    }
  }

  return result;
}

export function formatDiagnosticReport(
  error: Error,
  componentStack: string | null | undefined,
  snapshot: DiagnosticSnapshot,
  buildInfo?: { buildNumber?: string; commit?: string | null; env?: string; version?: string },
): string {
  const lines: (string | null)[] = [
    '=== MMG CONCIERGE DIAGNOSTIC REPORT ===',
    `Incident ID: ${snapshot.incidentId}`,
    `Timestamp: ${snapshot.timestamp}`,
    `Environment: ${buildInfo?.env ?? 'development'}`,
    `Version: ${buildInfo?.version ?? '1.0.0'} (Build ${buildInfo?.buildNumber ?? 'unknown'})`,
    buildInfo?.commit ? `Commit: ${buildInfo.commit}` : null,
    `Route: ${snapshot.currentRoute}`,
    `Segments: [${snapshot.segments.join(', ')}]`,
    `Auth Phase: ${snapshot.authPhase}`,
    '',
    '--- ERROR ---',
    `Name: ${error.name || 'Error'}`,
    `Message: ${sanitizeDiagnosticText(error.message || 'No message')}`,
    '',
    '--- COMPONENT STACK ---',
    componentStack ? sanitizeDiagnosticText(componentStack.trim()) : 'Not available',
    '',
    '--- JS STACK ---',
    error.stack ? sanitizeDiagnosticText(error.stack.trim()) : 'Not available',
    '',
    '--- RECENT BREADCRUMBS ---',
    snapshot.breadcrumbs.length > 0
      ? snapshot.breadcrumbs
        .map((b) => `[${b.timestamp}] [${b.category}] ${b.message}${b.data ? ` ${JSON.stringify(b.data)}` : ''}`)
        .join('\n')
      : 'None recorded',
    '=======================================',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}
