import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEV_PROJECT_ID = 'mmg-concierge-dev';
export const PROD_PROJECT_ID = 'mmg-concierge';
export const FIRESTORE_LOCATION = 'africa-south1';
export const SCHEDULER_LOCATION = 'europe-west1';
export const SCHEDULER_TIME_ZONE = 'Africa/Lagos';
export const FIRESTORE_DEPLOY_FILTER = 'firestore:rules,firestore:indexes';

export const REQUEST_FIRST_FUNCTIONS = Object.freeze([
  'createRentalRequest', 'approveRentalRequest', 'declineRentalRequest',
  'releaseRentalRequestPaymentHold', 'initializeRentalRequestPayment',
  'listRenterRentalRequests', 'listOwnerRentalRequests',
  'expireRentalRequestPaymentWindows', 'initializeBookingPayment',
  'paystackWebhook', 'processPaystackPaymentEvent', 'reconcilePayment',
  'requestAccountDeletion',
]);

export const PAYSTACK_SECRET_FUNCTIONS = Object.freeze([
  'initializeRentalRequestPayment', 'initializeBookingPayment',
  'paystackWebhook', 'processPaystackPaymentEvent', 'reconcilePayment',
]);

export const REQUIRED_APIS = Object.freeze([
  'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com',
  'cloudfunctions.googleapis.com', 'cloudscheduler.googleapis.com',
  'eventarc.googleapis.com', 'firebase.googleapis.com',
  'firebaseappcheck.googleapis.com', 'firebaserules.googleapis.com',
  'firestore.googleapis.com', 'identitytoolkit.googleapis.com',
  'pubsub.googleapis.com', 'run.googleapis.com', 'secretmanager.googleapis.com',
  'storage.googleapis.com',
]);

export const REQUIRED_RENTAL_REQUEST_INDEXES = Object.freeze([
  { collectionGroup: 'rentalRequests', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'ownerId', order: 'ASCENDING' }, { fieldPath: 'updatedAt', order: 'DESCENDING' },
  ] },
  { collectionGroup: 'rentalRequests', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'renterId', order: 'ASCENDING' }, { fieldPath: 'state', order: 'ASCENDING' },
  ] },
  { collectionGroup: 'rentalRequests', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'state', order: 'ASCENDING' }, { fieldPath: 'holdExpiresAt', order: 'ASCENDING' },
  ] },
]);

export function deployOnlyFilter(functions = REQUEST_FIRST_FUNCTIONS) {
  return [FIRESTORE_DEPLOY_FILTER, ...functions.map((name) => `functions:${name}`)].join(',');
}

export function assertSafeDeployTarget(projectId) {
  if (projectId !== DEV_PROJECT_ID) {
    throw new Error(`Refusing Firebase deployment target ${projectId || '(missing)'}; only ${DEV_PROJECT_ID} is allowed.`);
  }
  if (projectId === PROD_PROJECT_ID) throw new Error(`Refusing to target production project ${PROD_PROJECT_ID}.`);
}

export function assertMainRevision({ branch, headSha, mainSha, remoteMainSha, dirty }) {
  if (branch !== 'main') throw new Error(`Release deployment must run from main (current branch: ${branch || '(detached)'}).`);
  if (dirty) throw new Error('Release deployment requires a clean worktree.');
  if (!headSha || !mainSha || headSha !== mainSha) throw new Error('Release deployment source is not the checked-out main revision.');
  if (remoteMainSha && headSha !== remoteMainSha) throw new Error(`Checked-out main ${headSha} does not match origin/main ${remoteMainSha}.`);
  return headSha;
}

function withoutImplicitNameFields(fields = []) {
  return fields.filter((field) => field.fieldPath !== '__name__');
}

function stableIndexKey(index) {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: withoutImplicitNameFields(index.fields).map((field) => ({
      fieldPath: field.fieldPath, order: field.order, arrayConfig: field.arrayConfig,
    })),
  });
}

function stableOverrideKey(override) {
  return JSON.stringify({
    collectionGroup: override.collectionGroup, fieldPath: override.fieldPath,
    indexes: (override.indexes ?? []).map((index) => ({
      queryScope: index.queryScope, order: index.order, arrayConfig: index.arrayConfig,
    })),
  });
}

/** Firebase CLI returns {status,result:{indexes,fieldOverrides}} for JSON output. */
export function normalizeIndexConfig(raw) {
  const config = raw?.result && typeof raw.result === 'object' ? raw.result : raw;
  return {
    indexes: Array.isArray(config?.indexes) ? config.indexes : [],
    fieldOverrides: Array.isArray(config?.fieldOverrides) ? config.fieldOverrides : [],
  };
}

export function assertRemoteIndexesAdditive({ localIndexes, remoteIndexes }) {
  const localConfig = normalizeIndexConfig(localIndexes);
  const remoteConfig = normalizeIndexConfig(remoteIndexes);
  const local = new Set(localConfig.indexes.map(stableIndexKey));
  const missingIndexes = remoteConfig.indexes.filter((index) => !local.has(stableIndexKey(index)));
  const localOverrides = new Set(localConfig.fieldOverrides.map(stableOverrideKey));
  const missingOverrides = remoteConfig.fieldOverrides.filter((override) => !localOverrides.has(stableOverrideKey(override)));
  if (missingIndexes.length || missingOverrides.length) {
    throw new Error(`Local Firestore index config would remove ${missingIndexes.length} remote index(es) and ${missingOverrides.length} field override(s).`);
  }
  return { localIndexCount: local.size, remoteIndexCount: remoteConfig.indexes.length };
}

export function requiredIndexesReady(remoteIndexes, requiredIndexes = REQUIRED_RENTAL_REQUEST_INDEXES) {
  const remote = normalizeIndexConfig(remoteIndexes);
  return requiredIndexes.every((required) => remote.indexes.some((candidate) => (
    stableIndexKey(candidate) === stableIndexKey(required) && (!candidate.state || candidate.state === 'READY')
  )));
}

export async function waitForRentalRequestIndexes({
  readRemoteIndexes, maxWaitMs = 120_000, pollIntervalMs = 5_000,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  onProgress = () => {},
} = {}) {
  if (typeof readRemoteIndexes !== 'function') throw new Error('Index readiness polling requires a remote index reader.');
  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt <= maxWaitMs) {
    attempts += 1;
    if (requiredIndexesReady(await readRemoteIndexes())) return { attempts };
    onProgress(`Waiting for the three rentalRequests indexes to reach READY (attempt ${attempts}).`);
    await sleep(Math.min(pollIntervalMs, Math.max(0, maxWaitMs - (Date.now() - startedAt))));
  }
  throw new Error(`Timed out after ${maxWaitMs}ms waiting for the three rentalRequests indexes to reach READY.`);
}

function functionBlocks(source) {
  const blocks = new Map();
  const declaration = /export const (\w+) = on(?:Call|Request|DocumentCreated|Schedule)\s*\(/g;
  const matches = [...source.matchAll(declaration)];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    blocks.set(current[1], source.slice(current.index ?? 0, matches[index + 1]?.index ?? source.length));
  }
  return blocks;
}

export function assertPaystackSecretBindings(sourceByFile) {
  const boundFunctions = [];
  let secretDefinitionCount = 0;
  for (const [file, source] of Object.entries(sourceByFile)) {
    if (/\.test\.[cm]?[jt]s$/.test(file)) continue;
    if (/process\.env\.PAYSTACK_SECRET_KEY/.test(source)) throw new Error(`Ambient PAYSTACK_SECRET_KEY access is forbidden: ${file}`);
    if (/defineSecret\(\s*['"]PAYSTACK_SECRET_KEY['"]\s*\)/.test(source)) {
      secretDefinitionCount += 1;
      if (!file.endsWith('apps/functions/src/booking/paystack-secret.ts')) throw new Error(`PAYSTACK_SECRET_KEY must be defined in the shared secret module: ${file}`);
    }
    for (const [name, block] of functionBlocks(source)) {
      if (block.includes('paystackSecret')) {
        if (!/secrets\s*:\s*\[\s*paystackSecret\s*\]/.test(block)) throw new Error(`Payment secret is referenced without an explicit binding: ${file}:${name}`);
        boundFunctions.push(name);
      }
    }
  }
  if (secretDefinitionCount !== 1) throw new Error(`Expected exactly one PAYSTACK_SECRET_KEY definition; found ${secretDefinitionCount}.`);
  const actual = [...new Set(boundFunctions)].sort();
  const expected = [...PAYSTACK_SECRET_FUNCTIONS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Unexpected Paystack secret bindings. Expected ${expected.join(', ')}, found ${actual.join(', ') || '(none)'}.`);
  return actual;
}

async function collectFunctionSources(root) {
  const output = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) output[path] = await readFile(path, 'utf8');
    }
  }
  await visit(join(root, 'apps/functions/src'));
  return output;
}

function runCommand(command, args, { cwd }) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw new Error(`Preflight prerequisite unavailable: ${command} (${result.error.code ?? 'spawn failed'}).`);
  if (result.status !== 0) throw new Error(`Preflight command failed: ${command} exited with status ${result.status ?? 'unknown'}. Output was intentionally suppressed.`);
  return result.stdout.trim();
}

function parseJsonOutput(output, label) {
  try { return JSON.parse(output); } catch { throw new Error(`Read-only preflight returned invalid ${label} metadata.`); }
}

function requireText(path) {
  if (!existsSync(path)) throw new Error(`Required release file is missing: ${path}`);
  return readFileSync(path, 'utf8');
}

function assertLocalConfig(root) {
  const firebaseConfig = JSON.parse(requireText(join(root, 'firebase.json')));
  const firebaserc = JSON.parse(requireText(join(root, '.firebaserc')));
  if (firebaserc.projects?.development !== DEV_PROJECT_ID || firebaserc.projects?.default !== DEV_PROJECT_ID) throw new Error(`.firebaserc must default to ${DEV_PROJECT_ID} for development operations.`);
  if (firebaseConfig.firestore?.location !== FIRESTORE_LOCATION) throw new Error(`firebase.json must declare Firestore location ${FIRESTORE_LOCATION}.`);
  if (firebaseConfig.functions?.source !== 'apps/functions') throw new Error('firebase.json must point Functions at apps/functions.');
  return firebaseConfig;
}

export async function runLocalPreflight({ root = resolve(fileURLToPath(new URL('..', import.meta.url))) } = {}) {
  assertLocalConfig(root);
  assertPaystackSecretBindings(await collectFunctionSources(root));
  const indexes = JSON.parse(requireText(join(root, 'firebase/firestore.indexes.json')));
  if (!Array.isArray(indexes.indexes) || !Array.isArray(indexes.fieldOverrides)) throw new Error('firebase/firestore.indexes.json must declare indexes and fieldOverrides arrays.');
  const schedulerSource = requireText(join(root, 'apps/functions/src/booking/rental-request-payment-window-scheduler.ts'));
  if (!schedulerSource.includes(`region: '${SCHEDULER_LOCATION}'`) || !schedulerSource.includes(`timeZone: '${SCHEDULER_TIME_ZONE}'`)) throw new Error('expireRentalRequestPaymentWindows must remain in europe-west1 with Africa/Lagos timezone.');
  return { projectId: DEV_PROJECT_ID, functions: [...REQUEST_FIRST_FUNCTIONS], indexes };
}

export function hasNigeriaSmsAccess(config) {
  if (config?.signIn?.phoneNumber?.enabled !== true) return false;
  const regionConfig = config?.smsRegionConfig;
  if (!regionConfig) return true;
  const allowlistOnly = regionConfig.allowlistOnly;
  if (allowlistOnly === false || allowlistOnly == null) return true;
  const allowedRegions = typeof allowlistOnly === 'object'
    ? allowlistOnly.allowedRegions
    : regionConfig.allowedRegions ?? regionConfig.allowlist?.allowedRegions ?? regionConfig.allowlist?.regions;
  if (allowlistOnly === true && !Array.isArray(allowedRegions)) return false;
  return Array.isArray(allowedRegions) && allowedRegions.some((region) => String(region).toUpperCase() === 'NG');
}

function assertEnabledApis(metadata) {
  const enabled = new Set((metadata ?? []).map((service) => service.config?.name ?? service.name).filter(Boolean));
  const missing = REQUIRED_APIS.filter((api) => !enabled.has(api));
  if (missing.length) throw new Error(`Required Google APIs are not enabled: ${missing.join(', ')}`);
}

export function assertSecretMetadata(metadata, versions = []) {
  if (!String(metadata?.name ?? '').endsWith('/secrets/PAYSTACK_SECRET_KEY')) throw new Error('PAYSTACK_SECRET_KEY Secret Manager metadata is missing.');
  if (!metadata.replication) throw new Error('PAYSTACK_SECRET_KEY Secret Manager replication metadata is missing.');
  if (!(versions ?? []).some((version) => version.state === 'ENABLED')) throw new Error('PAYSTACK_SECRET_KEY has no ENABLED Secret Manager version.');
}

export function assertSchedulerHealth(jobs, { required = true } = {}) {
  const warnings = [];
  const canonical = (jobs ?? []).find((job) => String(job.name ?? '').includes('expireRentalRequestPaymentWindows'));
  const scheduleIsFiveMinutes = canonical?.schedule === 'every 5 minutes' || canonical?.schedule === '*/5 * * * *';
  if (!canonical || canonical.state !== 'ENABLED' || !scheduleIsFiveMinutes || canonical.timeZone !== SCHEDULER_TIME_ZONE) {
    if (required) throw new Error('Canonical expireRentalRequestPaymentWindows scheduler is not healthy in europe-west1.');
    warnings.push('Canonical expireRentalRequestPaymentWindows scheduler is not present yet; post-deployment verification is required.');
  }
  if ((jobs ?? []).some((job) => String(job.name ?? '').includes('emitOwnerResponseSlaAlerts'))) warnings.push('Legacy emitOwnerResponseSlaAlerts resource detected; inspect only and do not delete automatically.');
  return warnings;
}

export function assertFunctionSecretMetadata(descriptions, { phase = 'postdeploy' } = {}) {
  const byName = new Map();
  const warnings = [];
  for (const description of descriptions ?? []) {
    const name = String(description.name ?? '').split('/').pop();
    byName.set(name, description);
    const service = description.serviceConfig ?? {};
    const secretKeys = (service.secretEnvironmentVariables ?? []).map((item) => item.key);
    const environmentKeys = Object.keys(service.environmentVariables ?? {});
    const hasPlain = environmentKeys.includes('PAYSTACK_SECRET_KEY');
    const hasSecret = secretKeys.includes('PAYSTACK_SECRET_KEY');
    if (REQUEST_FIRST_FUNCTIONS.includes(name)) {
      if (hasPlain) throw new Error(`Target Function ${name} exposes PAYSTACK_SECRET_KEY as a plain environment variable.`);
      if (PAYSTACK_SECRET_FUNCTIONS.includes(name) ? (phase === 'postdeploy' && !hasSecret) : hasSecret) throw new Error(`Target Function ${name} has an invalid Paystack secret binding.`);
    } else if (hasPlain || hasSecret) {
      warnings.push(`Legacy unrelated Function ${name} has a Paystack environment/secret binding; no cleanup was attempted.`);
    }
  }
  if (phase === 'postdeploy') {
    const missing = REQUEST_FIRST_FUNCTIONS.filter((name) => !byName.has(name));
    if (missing.length) throw new Error(`Post-deployment verification is missing targeted Function(s): ${missing.join(', ')}`);
  }
  return warnings;
}

async function defaultGoogleJson(path) {
  let GoogleAuth;
  try { ({ GoogleAuth } = await import('google-auth-library')); } catch { throw new Error('Remote preflight requires google-auth-library; install dependencies before running it.'); }
  let client;
  try { client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient(); }
  catch { throw new Error('Remote preflight requires authenticated Google Application Default Credentials; gcloud is not required, and no credential value is printed.'); }
  const host = path.startsWith('/admin/v2/')
    ? 'identitytoolkit.googleapis.com'
    : path.includes('/databases/')
      ? 'firestore.googleapis.com'
      : path.endsWith('/billingInfo')
        ? 'cloudbilling.googleapis.com'
        : path.includes('/services')
          ? 'serviceusage.googleapis.com'
          : path.includes('/secrets/')
            ? 'secretmanager.googleapis.com'
            : path.includes('/locations/') && path.includes('/jobs')
              ? 'cloudscheduler.googleapis.com'
              : 'cloudfunctions.googleapis.com';
  try { return (await client.request({ url: `https://${host}${path}` })).data; }
  catch { throw new Error(`Authenticated Google REST preflight request failed for ${path}. Response output was suppressed.`); }
}

async function defaultFirebaseIndexes(root) {
  return parseJsonOutput(runCommand('npx', ['-y', 'firebase-tools@latest', 'firestore:indexes', '--project', DEV_PROJECT_ID, '--json'], { cwd: root }), 'Firestore indexes');
}

async function listGoogleResources(googleJson, path, key) {
  return (await googleJson(path))?.[key] ?? [];
}

export async function runRemotePreflight({ root, phase = 'predeploy', googleJson = defaultGoogleJson, readRemoteIndexes = () => defaultFirebaseIndexes(root) } = {}) {
  const project = DEV_PROJECT_ID;
  const database = await googleJson(`/v1/projects/${project}/databases/(default)`);
  const edition = database.edition ?? database.databaseEdition;
  if (edition !== 'STANDARD' || (database.locationId ?? database.location) !== FIRESTORE_LOCATION) throw new Error(`Development Firestore must be Standard in ${FIRESTORE_LOCATION}.`);
  const billing = await googleJson(`/v1/projects/${project}/billingInfo`);
  if (billing.billingEnabled !== true) throw new Error('Development project billing is not enabled.');
  const services = await listGoogleResources(googleJson, `/v1/projects/${project}/services?filter=state%3AENABLED&pageSize=200`, 'services');
  assertEnabledApis(services);
  const secret = await googleJson(`/v1/projects/${project}/secrets/PAYSTACK_SECRET_KEY`);
  const versions = await listGoogleResources(googleJson, `/v1/${secret.name}/versions?filter=state%3DENABLED&pageSize=100`, 'versions');
  assertSecretMetadata(secret, versions);
  const localIndexes = JSON.parse(requireText(join(root, 'firebase/firestore.indexes.json')));
  assertRemoteIndexesAdditive({ localIndexes, remoteIndexes: await readRemoteIndexes() });
  if (!hasNigeriaSmsAccess(await googleJson(`/admin/v2/projects/${project}/config`))) throw new Error('Phone Auth is not enabled with NG SMS access in development.');
  const jobs = await listGoogleResources(googleJson, `/v1/projects/${project}/locations/${SCHEDULER_LOCATION}/jobs`, 'jobs');
  const warnings = assertSchedulerHealth(jobs, { required: phase === 'postdeploy' });
  const functions = await listGoogleResources(googleJson, `/v2/projects/${project}/locations/-/functions?pageSize=100`, 'functions');
  const descriptions = await Promise.all(functions.map((item) => googleJson(`/v2/${item.name}`)));
  if (descriptions.some((description) => String(description.name ?? '').includes('emitOwnerResponseSlaAlerts'))) warnings.push('Legacy emitOwnerResponseSlaAlerts Function detected; inspect only and do not delete automatically.');
  warnings.push(...assertFunctionSecretMetadata(descriptions, { phase }));
  return { projectId: project, phase, schedulerLocation: SCHEDULER_LOCATION, functionCount: descriptions.length, warnings };
}

async function deployFirebase(root, filter) {
  runCommand('npx', ['-y', 'firebase-tools@latest', 'deploy', '--project', DEV_PROJECT_ID, '--only', filter, '--non-interactive'], { cwd: root });
}

async function orchestrateDeployment(root) {
  console.log('Deploying Firestore Rules and indexes to mmg-concierge-dev.');
  await deployFirebase(root, FIRESTORE_DEPLOY_FILTER);
  await waitForRentalRequestIndexes({ readRemoteIndexes: () => defaultFirebaseIndexes(root), onProgress: (message) => console.log(message) });
  console.log('Required rentalRequests indexes are READY; deploying targeted Functions.');
  await deployFirebase(root, deployOnlyFilter(REQUEST_FIRST_FUNCTIONS).replace(`${FIRESTORE_DEPLOY_FILTER},`, ''));
  const postflight = await runRemotePreflight({ root, phase: 'postdeploy' });
  for (const warning of postflight.warnings) console.warn(`Warning: ${warning}`);
  console.log(`Request-first development resources deployed to ${DEV_PROJECT_ID}.`);
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const command = process.argv[2] ?? 'preflight';
  const projectFlag = process.argv.find((argument) => argument === '--project' || argument.startsWith('--project='));
  const project = projectFlag?.includes('=') ? projectFlag.split('=')[1] : process.argv[process.argv.indexOf('--project') + 1];
  assertSafeDeployTarget(project ?? DEV_PROJECT_ID);
  if (command === 'audit') { await runLocalPreflight({ root }); console.log('Firebase release hardening audit passed.'); return; }
  const revision = runCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
  const branch = runCommand('git', ['branch', '--show-current'], { cwd: root });
  const mainSha = runCommand('git', ['rev-parse', 'refs/heads/main'], { cwd: root });
  const remoteMainSha = (() => { try { return runCommand('git', ['rev-parse', 'refs/remotes/origin/main'], { cwd: root }); } catch { return undefined; } })();
  const dirty = runCommand('git', ['status', '--porcelain'], { cwd: root });
  assertMainRevision({ branch, headSha: revision, mainSha, remoteMainSha, dirty });
  await runLocalPreflight({ root });
  if (command === 'preflight') {
    if (process.argv.includes('--remote')) {
      const result = await runRemotePreflight({ root, phase: process.argv.includes('--postdeploy') ? 'postdeploy' : 'predeploy' });
      for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    }
    console.log(`Development preflight passed for ${DEV_PROJECT_ID} at ${revision}.`); return;
  }
  if (command === 'deploy') {
    if (!process.argv.includes('--remote')) throw new Error('Run the remote preflight before this deployment command.');
    const result = await runRemotePreflight({ root, phase: 'predeploy' });
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    await orchestrateDeployment(root); return;
  }
  throw new Error(`Unknown command ${command}. Use audit, preflight, or deploy.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Firebase release hardening failed.'); process.exitCode = 1; });
}
