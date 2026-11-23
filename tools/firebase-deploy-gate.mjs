import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIREBASE_DEPLOY_PATHS = [
  'apps/functions/',
  'packages/contracts/',
  'packages/domain/',
  'firebase/',
  'firebase.json',
  '.firebaserc',
  'package.json',
  'package-lock.json',
  'tools/firebase-secrets-audit.mjs',
];

export function isFirebaseDeployPath(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) return false;
  return FIREBASE_DEPLOY_PATHS.some((entry) =>
    entry.endsWith('/') ? normalized.startsWith(entry) : normalized === entry,
  );
}

export function resolvePreviousDeploySha(runs, { currentRunId, isAncestor }) {
  if (!Array.isArray(runs)) return null;
  for (const run of runs) {
    if (!run || typeof run !== 'object') continue;
    if (String(run.id) === String(currentRunId)) continue;
    if (run.conclusion !== 'success') continue;
    const sha = typeof run.head_sha === 'string' ? run.head_sha.trim() : '';
    if (!sha) continue;
    if (isAncestor(sha)) return sha;
  }
  return null;
}

export function decideFirebaseDeploy({
  eventName,
  baseSha,
  headSha,
  changedFiles = [],
  baseIsAncestor = false,
}) {
  if (eventName === 'workflow_dispatch') {
    return { deploy: true, reason: 'manual_dispatch', matchedFiles: [] };
  }
  if (!baseSha || !baseIsAncestor) {
    return { deploy: true, reason: 'missing_or_unrelated_base', matchedFiles: [] };
  }
  if (baseSha === headSha) {
    return { deploy: false, reason: 'already_deployed_sha', matchedFiles: [] };
  }
  const matchedFiles = changedFiles.filter(isFirebaseDeployPath);
  if (matchedFiles.length > 0) {
    return { deploy: true, reason: 'backend_inputs_changed', matchedFiles };
  }
  return { deploy: false, reason: 'no_backend_inputs_changed', matchedFiles: [] };
}

export function gitIsAncestor(cwd, ancestorSha, headSha = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorSha, headSha], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function gitChangedFiles(cwd, baseSha, headSha = 'HEAD') {
  const output = execFileSync('git', ['diff', '--name-only', baseSha, headSha], {
    cwd,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchPreviousSuccessfulRuns({ repository, token, workflowFile = 'deploy-development.yml', branch = 'main' }) {
  if (!repository || !token) return null;
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=50`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions API returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

async function main() {
  const cwd = process.cwd();
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const headSha = process.env.TARGET_SHA?.trim() || execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const currentRunId = process.env.GITHUB_RUN_ID ?? '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';

  let baseSha = null;
  let baseIsAncestor = false;
  let changedFiles = [];

  if (eventName !== 'workflow_dispatch') {
    try {
      const runs = await fetchPreviousSuccessfulRuns({ repository, token });
      baseSha = resolvePreviousDeploySha(runs, {
        currentRunId,
        isAncestor: (sha) => gitIsAncestor(cwd, sha, headSha),
      });
      if (baseSha) {
        changedFiles = gitChangedFiles(cwd, baseSha, headSha);
        baseIsAncestor = true;
      }
    } catch (error) {
      console.warn(`Could not query prior Deploy Development runs (failing closed to deploy=true): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const decision = decideFirebaseDeploy({
    eventName,
    baseSha,
    headSha,
    changedFiles,
    baseIsAncestor,
  });

  console.log(
    JSON.stringify({
      eventName,
      baseSha,
      headSha,
      deploy: decision.deploy,
      reason: decision.reason,
      matchedCount: decision.matchedFiles.length,
      matchedFiles: decision.matchedFiles.slice(0, 20),
    }),
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `deploy=${decision.deploy ? 'true' : 'false'}\nreason=${decision.reason}\nbase_sha=${baseSha ?? ''}\n`,
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
