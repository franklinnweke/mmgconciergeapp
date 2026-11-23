import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  decideFirebaseDeploy,
  gitChangedFiles,
  gitIsAncestor,
  isFirebaseDeployPath,
  resolvePreviousDeploySha,
} from './firebase-deploy-gate.mjs';

describe('Firebase development deploy gate', () => {
  it('triggers deployment for Functions, shared backend packages, rules, and build/lockfile inputs', () => {
    const triggeringPaths = [
      'apps/functions/src/booking/rental-request-service.ts',
      'packages/contracts/src/rental-request.ts',
      'packages/domain/src/index.ts',
      'firebase/firestore.rules',
      'firebase/storage.rules',
      'firebase/firestore.indexes.json',
      'firebase.json',
      '.firebaserc',
      'package.json',
      'package-lock.json',
      'tools/firebase-secrets-audit.mjs',
    ];

    for (const filePath of triggeringPaths) {
      expect(isFirebaseDeployPath(filePath), filePath).toBe(true);
    }
  });

  it('skips deployment for mobile-only, admin-only, brand-only, and docs-only changes', () => {
    const ignoredPaths = [
      'apps/mobile/src/app/_layout.tsx',
      'apps/mobile/eas.json',
      'apps/admin/src/app/page.tsx',
      'packages/brand/src/index.ts',
      'AGENTS.md',
      'docs/operations/PICKUP_DISPATCH_ACCEPTANCE.md',
    ];

    for (const filePath of ignoredPaths) {
      expect(isFirebaseDeployPath(filePath), filePath).toBe(false);
    }
  });

  it('fails closed to deploy=true when no valid ancestor base SHA is available', () => {
    expect(
      decideFirebaseDeploy({
        eventName: 'workflow_run',
        baseSha: null,
        headSha: 'abc123',
        changedFiles: [],
        baseIsAncestor: false,
      }),
    ).toEqual({
      deploy: true,
      reason: 'missing_or_unrelated_base',
      matchedFiles: [],
    });
  });

  it('always deploys on manual workflow_dispatch', () => {
    expect(
      decideFirebaseDeploy({
        eventName: 'workflow_dispatch',
        baseSha: 'abc123',
        headSha: 'abc123',
        changedFiles: [],
        baseIsAncestor: true,
      }),
    ).toEqual({
      deploy: true,
      reason: 'manual_dispatch',
      matchedFiles: [],
    });
  });

  it('selects the most recent successful ancestor run while ignoring the current and failed runs', () => {
    const runs = [
      { id: 105, conclusion: 'success', head_sha: 'current-sha' },
      { id: 104, conclusion: 'failure', head_sha: 'failed-sha' },
      { id: 103, conclusion: 'success', head_sha: 'orphaned-sha' },
      { id: 102, conclusion: 'success', head_sha: 'good-ancestor-sha' },
    ];

    const resolved = resolvePreviousDeploySha(runs, {
      currentRunId: 105,
      isAncestor: (sha) => sha === 'good-ancestor-sha',
    });

    expect(resolved).toBe('good-ancestor-sha');
  });

  it('catches contract/domain changes in earlier commits of a multi-commit push', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mmg-deploy-gate-'));
    try {
      const git = (...args) =>
        execFileSync('git', args, {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
          },
        }).trim();

      git('init');
      mkdirSync(path.join(tempDir, 'packages/contracts/src'), { recursive: true });
      mkdirSync(path.join(tempDir, 'apps/mobile/src'), { recursive: true });

      writeFileSync(path.join(tempDir, 'packages/contracts/src/index.ts'), 'export const v = 1;\n');
      git('add', '.');
      git('commit', '-m', 'base');
      const baseSha = git('rev-parse', 'HEAD');

      // Commit 1 in multi-commit push changes contracts only.
      writeFileSync(path.join(tempDir, 'packages/contracts/src/index.ts'), 'export const v = 2;\n');
      git('add', '.');
      git('commit', '-m', 'contract change');

      // Commit 2 in multi-commit push changes mobile only (HEAD^..HEAD would miss commit 1).
      writeFileSync(path.join(tempDir, 'apps/mobile/src/app.ts'), 'export const m = 1;\n');
      git('add', '.');
      git('commit', '-m', 'mobile change');
      const headSha = git('rev-parse', 'HEAD');

      expect(gitIsAncestor(tempDir, baseSha, headSha)).toBe(true);
      const changedFiles = gitChangedFiles(tempDir, baseSha, headSha);
      const decision = decideFirebaseDeploy({
        eventName: 'workflow_run',
        baseSha,
        headSha,
        changedFiles,
        baseIsAncestor: true,
      });

      expect(decision.deploy).toBe(true);
      expect(decision.reason).toBe('backend_inputs_changed');
      expect(decision.matchedFiles).toEqual(['packages/contracts/src/index.ts']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
