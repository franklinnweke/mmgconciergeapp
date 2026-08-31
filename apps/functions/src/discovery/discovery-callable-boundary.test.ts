import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const functionsSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function exportedCallableBlock(exportName: string, nextExportName: string): string {
  const start = functionsSource.indexOf(`export const ${exportName} = onCall(`);
  const end = functionsSource.indexOf(`export const ${nextExportName} = onCall(`, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return functionsSource.slice(start, end);
}

describe('discovery callable security boundary', () => {
  it('requires App Check and Firebase Auth for place resolution', () => {
    const block = exportedCallableBlock('resolveSearchPlace', 'searchVehicles');

    expect(block).toMatch(/enforceAppCheck:\s*true/);
    expect(block).toContain('requireAuthenticatedUser(request.auth);');
  });

  it('requires App Check and authenticated renter access for vehicle search', () => {
    const block = exportedCallableBlock('searchVehicles', 'completeRenterProfile');

    expect(block).toMatch(/enforceAppCheck:\s*true/);
    expect(block).toContain('requireAuthenticatedRenter(request.auth);');
  });
});
