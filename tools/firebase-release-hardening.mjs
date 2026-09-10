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

export const REQUEST_FIRST_FUNCTIONS = Object.freeze([
  'createRentalRequest',
  'approveRentalRequest',
  'declineRentalRequest',
  'releaseRentalRequestPaymentHold',
  'initializeRentalRequestPayment',
  'listRenterRentalRequests',
  'listOwnerRentalRequests',
  'expireRentalRequestPaymentWindows',
  'initializeBookingPayment',
  'paystackWebhook',
  'processPaystackPaymentEvent',
  'reconcilePayment',
  'requestAccountDeletion',
]);

export const PAYSTACK_SECRET_FUNCTIONS = Object.freeze([
  'initializeRentalRequestPayment',
  'initializeBookingPayment',
  'paystackWebhook',
  'processPaystackPaymentEvent',
  'reconcilePayment',
]);

export const REQUIRED_APIS = Object.freeze([
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'cloudfunctions.googleapis.com',
  'cloudscheduler.googleapis.com',
  'eventarc.googleapis.com',
  'firebase.googleapis.com',
  'firebaseappcheck.googleapis.com',
  'firebaserules.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'pubsub.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com',
  'storage.googleapis.com',
]);

export function deployOnlyFilter(functions = REQUEST_FIRST_FUNCTIONS) {
  return ['firestore:rules', 'firestore:indexes', ...functions.map((name) => `functions:${name}`)].join(',');
}

export function assertSafeDeployTarget(projectId) {
  if (projectId !== DEV_PROJECT_ID) {
    throw new Error(`Refusing Firebase deployment target ${projectId || '(missing)'}; only ${DEV_PROJECT_ID} is allowed.`);
  }
  if (projectId === PROD_PROJECT_ID) {
    throw new Error(`Refusing to target production project ${PROD_PROJECT_ID}.`);
  }
}

export function assertMainRevision({ branch, headSha, mainSha, remoteMainSha, dirty }) {
  if (branch !== 'main') throw new Error(`Release deployment must run from main (current branch: ${branch || '(detached)'}).`);
  if (dirty) throw new Error('Release deployment requires a clean worktree.');
  if (!headSha || !mainSha || headSha !== mainSha) {
    throw new Error('Release deployment source is not the checked-out main revision.');
  }
  if (remoteMainSha && headSha !== remoteMainSha) {
    throw new Error(`Checked-out main ${headSha} does not match origin/main ${remoteMainSha}.`);
  }
  return headSha;
}

function stableIndexKey(index) {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: (index.fields ?? []).map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order,
      arrayConfig: field.arrayConfig,
    })),
  });
}

function stableOverrideKey(override) {
  return JSON.stringify({
    collectionGroup: override.collectionGroup,
    fieldPath: override.fieldPath,
    indexes: (override.indexes ?? []).map((index) => ({
      queryScope: index.queryScope,
      order: index.order,
      arrayConfig: index.arrayConfig,
    })),
  });
}

export function assertRemoteIndexesAdditive({ localIndexes, remoteIndexes }) {
  const local = new Set((localIndexes?.indexes ?? []).map(stableIndexKey));
  const missingIndexes = (remoteIndexes?.indexes ?? []).filter((index) => !local.has(stableIndexKey(index)));
  const localOverrides = new Set((localIndexes?.fieldOverrides ?? []).map(stableOverrideKey));
  const missingOverrides = (remoteIndexes?.fieldOverrides ?? []).filter(
    (override) => !localOverrides.has(stableOverrideKey(override)),
  );
  if (missingIndexes.length || missingOverrides.length) {
    throw new Error(
      `Local Firestore index config would remove ${missingIndexes.length} remote index(es) and ${missingOverrides.length} field override(s).`,
    );
  }
  return { localIndexCount: local.size, remoteIndexCount: (remoteIndexes?.indexes ?? []).length };
}

function functionBlocks(source) {
  const blocks = new Map();
  const declaration = /export const (\w+) = on(?:Call|Request|DocumentCreated|Schedule)\s*\(/g;
  const matches = [...source.matchAll(declaration)];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    blocks.set(current[1], source.slice(start, end));
  }
  return blocks;
}

/**
 * Audits checked-in source only. It intentionally never reads Secret Manager
 * values and rejects ambient PAYSTACK_SECRET_KEY access.
 */
export function assertPaystackSecretBindings(sourceByFile) {
  const boundFunctions = [];
  let secretDefinitionCount = 0;
  for (const [file, source] of Object.entries(sourceByFile)) {
    if (/\.test\.[cm]?[jt]s$/.test(file)) continue;
    if (/process\.env\.PAYSTACK_SECRET_KEY/.test(source)) {
      throw new Error(`Ambient PAYSTACK_SECRET_KEY access is forbidden: ${file}`);
    }
    if (/defineSecret\(\s*['"]PAYSTACK_SECRET_KEY['"]\s*\)/.test(source)) {
      secretDefinitionCount += 1;
      if (!file.endsWith('apps/functions/src/booking/paystack-secret.ts')) {
        throw new Error(`PAYSTACK_SECRET_KEY must be defined in the shared secret module: ${file}`);
      }
    }
    for (const [name, block] of functionBlocks(source)) {
      if (block.includes('paystackSecret')) {
        if (!/secrets\s*:\s*\[\s*paystackSecret\s*\]/.test(block)) {
          throw new Error(`Payment secret is referenced without an explicit binding: ${file}:${name}`);
        }
        boundFunctions.push(name);
      }
    }
  }
  if (secretDefinitionCount !== 1) {
    throw new Error(`Expected exactly one PAYSTACK_SECRET_KEY definition; found ${secretDefinitionCount}.`);
  }
  const actual = [...new Set(boundFunctions)].sort();
  const expected = [...PAYSTACK_SECRET_FUNCTIONS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Paystack secret bindings. Expected ${expected.join(', ')}, found ${actual.join(', ') || '(none)'}.`);
  }
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
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.error || result.status !== 0) throw new Error(`Read-only preflight command failed: ${command}`);
  return result.stdout.trim();
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Read-only preflight returned invalid ${label} metadata.`);
  }
}

function assertLocalConfig(root) {
  const firebaseConfig = JSON.parse(requireText(join(root, 'firebase.json')));
  const firebaserc = JSON.parse(requireText(join(root, '.firebaserc')));
  if (firebaserc.projects?.development !== DEV_PROJECT_ID || firebaserc.projects?.default !== DEV_PROJECT_ID) {
    throw new Error(`.firebaserc must default to ${DEV_PROJECT_ID} for development operations.`);
  }
  if (firebaseConfig.firestore?.location !== FIRESTORE_LOCATION) {
    throw new Error(`firebase.json must declare Firestore location ${FIRESTORE_LOCATION}.`);
  }
  if (firebaseConfig.functions?.source !== 'apps/functions') {
    throw new Error('firebase.json must point Functions at apps/functions.');
  }
  return firebaseConfig;
}

function requireText(path) {
  if (!existsSync(path)) throw new Error(`Required release file is missing: ${path}`);
  return readFileSync(path, 'utf8');
}

export async function runLocalPreflight({ root = resolve(fileURLToPath(new URL('..', import.meta.url))) } = {}) {
  assertLocalConfig(root);
  const sources = await collectFunctionSources(root);
  assertPaystackSecretBindings(sources);
  const indexes = JSON.parse(requireText(join(root, 'firebase/firestore.indexes.json')));
  if (!Array.isArray(indexes.indexes) || !Array.isArray(indexes.fieldOverrides)) {
    throw new Error('firebase/firestore.indexes.json must declare indexes and fieldOverrides arrays.');
  }
  const schedulerSource = requireText(join(root, 'apps/functions/src/booking/rental-request-payment-window-scheduler.ts'));
  if (!schedulerSource.includes(`region: '${SCHEDULER_LOCATION}'`) || !schedulerSource.includes(`timeZone: '${SCHEDULER_TIME_ZONE}'`)) {
    throw new Error('expireRentalRequestPaymentWindows must remain in europe-west1 with Africa/Lagos timezone.');
  }
  return { projectId: DEV_PROJECT_ID, functions: [...REQUEST_FIRST_FUNCTIONS], indexes };
}

function hasNigeriaSmsAccess(config) {
  const phone = config?.signIn?.phoneNumber;
  if (phone?.enabled !== true) return false;
  const regionConfig = config?.smsRegionConfig;
  if (!regionConfig || regionConfig.allowlistOnly !== true) return true;
  const regions = regionConfig.allowlist?.regions ?? regionConfig.allowlist?.regionCodes ?? regionConfig.allowlist ?? [];
  return Array.isArray(regions) && regions.some((region) => String(region).toUpperCase() === 'NG');
}

function assertEnabledApis(metadata) {
  const enabled = new Set((metadata ?? []).map((service) => service.config?.name ?? service.name).filter(Boolean));
  const missing = REQUIRED_APIS.filter((api) => !enabled.has(api));
  if (missing.length) throw new Error(`Required Google APIs are not enabled: ${missing.join(', ')}`);
}

function assertSecretMetadata(metadata) {
  const name = String(metadata?.name ?? '');
  if (!name.endsWith(`/secrets/PAYSTACK_SECRET_KEY`)) throw new Error('PAYSTACK_SECRET_KEY Secret Manager metadata is missing.');
  if (!metadata.replication) throw new Error('PAYSTACK_SECRET_KEY Secret Manager replication metadata is missing.');
}

function assertSchedulerHealth(jobs) {
  const canonical = (jobs ?? []).find((job) => String(job.name ?? '').includes('expireRentalRequestPaymentWindows'));
  const scheduleIsFiveMinutes = canonical?.schedule === 'every 5 minutes' || canonical?.schedule === '*/5 * * * *';
  if (!canonical || canonical.state !== 'ENABLED' || !scheduleIsFiveMinutes || canonical.timeZone !== SCHEDULER_TIME_ZONE) {
    throw new Error('Canonical expireRentalRequestPaymentWindows scheduler is not healthy in europe-west1.');
  }
}

function assertFunctionSecretMetadata(descriptions) {
  for (const description of descriptions) {
    const name = String(description.name ?? '').split('/').pop();
    const service = description.serviceConfig ?? {};
    const secretKeys = (service.secretEnvironmentVariables ?? []).map((item) => item.key);
    const environmentKeys = Object.keys(service.environmentVariables ?? {});
    if (environmentKeys.includes('PAYSTACK_SECRET_KEY')) {
      throw new Error(`Function ${name} exposes PAYSTACK_SECRET_KEY as a plain environment variable.`);
    }
    if (secretKeys.includes('PAYSTACK_SECRET_KEY') && !PAYSTACK_SECRET_FUNCTIONS.includes(name)) {
      throw new Error(`Function ${name} has an unintended PAYSTACK_SECRET_KEY secret binding.`);
    }
  }
}

export async function runRemotePreflight({ root, run = (command, args) => runCommand(command, args, { cwd: root }), fetchImpl = fetch } = {}) {
  const project = DEV_PROJECT_ID;
  const database = parseJsonOutput(run('gcloud', ['firestore', 'databases', 'describe', '(default)', `--project=${project}`, '--format=json']), 'Firestore database');
  if (database.edition !== 'STANDARD' || (database.locationId ?? database.location) !== FIRESTORE_LOCATION) {
    throw new Error(`Development Firestore must be Standard in ${FIRESTORE_LOCATION}.`);
  }
  const billing = parseJsonOutput(run('gcloud', ['beta', 'billing', 'projects', 'describe', project, '--format=json']), 'billing');
  if (billing.billingEnabled !== true) throw new Error('Development project billing is not enabled.');
  assertEnabledApis(parseJsonOutput(run('gcloud', ['services', 'list', `--project=${project}`, '--enabled', '--format=json']), 'enabled API'));
  assertSecretMetadata(parseJsonOutput(run('gcloud', ['secrets', 'describe', 'PAYSTACK_SECRET_KEY', `--project=${project}`, '--format=json']), 'secret metadata'));

  const localIndexes = JSON.parse(requireText(join(root, 'firebase/firestore.indexes.json')));
  const remoteIndexes = parseJsonOutput(run('npx', ['-y', 'firebase-tools@latest', 'firestore:indexes', '--project', project, '--json']), 'Firestore indexes');
  assertRemoteIndexesAdditive({ localIndexes, remoteIndexes });

  const token = run('gcloud', ['auth', 'print-access-token']);
  const authResponse = await fetchImpl(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!authResponse.ok || !hasNigeriaSmsAccess(await authResponse.json())) {
    throw new Error('Phone Auth is not enabled with NG SMS access in development.');
  }

  const jobs = parseJsonOutput(run('gcloud', ['scheduler', 'jobs', 'list', `--project=${project}`, `--location=${SCHEDULER_LOCATION}`, '--format=json']), 'scheduler metadata');
  assertSchedulerHealth(jobs);

  const listed = parseJsonOutput(run('gcloud', ['functions', 'list', '--gen2', `--project=${project}`, '--format=json']), 'function metadata');
  const descriptions = listed.map((item) => {
    const name = String(item.name ?? '').split('/').pop();
    const location = String(item.name ?? '').match(/locations\/([^/]+)/)?.[1] ?? FIRESTORE_LOCATION;
    return parseJsonOutput(run('gcloud', ['functions', 'describe', name, '--gen2', `--region=${location}`, `--project=${project}`, '--format=json']), 'function metadata');
  });
  assertFunctionSecretMetadata(descriptions);
  return { projectId: project, schedulerLocation: SCHEDULER_LOCATION, functionCount: descriptions.length };
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const command = process.argv[2] ?? 'preflight';
  const projectFlag = process.argv.find((argument) => argument === '--project' || argument.startsWith('--project='));
  const project = projectFlag?.includes('=') ? projectFlag.split('=')[1] : process.argv[process.argv.indexOf('--project') + 1];
  assertSafeDeployTarget(project ?? DEV_PROJECT_ID);
  if (command === 'audit') {
    await runLocalPreflight({ root });
    console.log('Firebase release hardening audit passed.');
    return;
  }
  if (command === 'preflight') {
    const revision = runCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
    const branch = runCommand('git', ['branch', '--show-current'], { cwd: root });
    const mainSha = runCommand('git', ['rev-parse', 'refs/heads/main'], { cwd: root });
    const remoteMainSha = (() => {
      try { return runCommand('git', ['rev-parse', 'refs/remotes/origin/main'], { cwd: root }); } catch { return undefined; }
    })();
    const dirty = runCommand('git', ['status', '--porcelain'], { cwd: root });
    assertMainRevision({ branch, headSha: revision, mainSha, remoteMainSha, dirty });
    await runLocalPreflight({ root });
    if (process.argv.includes('--remote')) await runRemotePreflight({ root });
    console.log(`Development preflight passed for ${DEV_PROJECT_ID} at ${revision}.`);
    return;
  }
  if (command === 'deploy') {
    const revision = runCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
    const branch = runCommand('git', ['branch', '--show-current'], { cwd: root });
    const mainSha = runCommand('git', ['rev-parse', 'refs/heads/main'], { cwd: root });
    const remoteMainSha = runCommand('git', ['rev-parse', 'refs/remotes/origin/main'], { cwd: root });
    const dirty = runCommand('git', ['status', '--porcelain'], { cwd: root });
    assertMainRevision({ branch, headSha: revision, mainSha, remoteMainSha, dirty });
    await runLocalPreflight({ root });
    if (!process.argv.includes('--remote')) throw new Error('Run preflight --remote before this deployment command.');
    await runRemotePreflight({ root });
    runCommand('npx', ['-y', 'firebase-tools@latest', 'deploy', '--project', DEV_PROJECT_ID, '--only', deployOnlyFilter(), '--non-interactive'], { cwd: root });
    console.log(`Request-first development resources deployed to ${DEV_PROJECT_ID} from ${revision}.`);
    return;
  }
  throw new Error(`Unknown command ${command}. Use audit, preflight, or deploy.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Firebase release hardening failed.');
    process.exitCode = 1;
  });
}
