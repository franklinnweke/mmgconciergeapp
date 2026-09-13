import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const legacyFunctionsSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const discoverySource = readFileSync(new URL('./discovery-callables.ts', import.meta.url), 'utf8');
const deploySource = readFileSync(new URL('../deploy.ts', import.meta.url), 'utf8');

function legacyCallableBlock(exportName: string, nextExportName: string): string {
  const start = legacyFunctionsSource.indexOf(`export const ${exportName} = onCall(`);
  const end = legacyFunctionsSource.indexOf(`export const ${nextExportName} = onCall(`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return legacyFunctionsSource.slice(start, end);
}

describe('discovery callable security boundary', () => {
  it('keeps place resolution behind App Check and Firebase Auth', () => {
    const block = legacyCallableBlock('resolveSearchPlace', 'searchVehicles');
    expect(block).toMatch(/enforceAppCheck:\s*true/);
    expect(block).toContain('requireAuthenticatedUser(request.auth);');
  });

  it('deploys schema-validated App Check + renter-auth search and detail callables', () => {
    expect(discoverySource).toMatch(/enforceAppCheck:\s*true/);
    expect(discoverySource.match(/requireAuthenticatedRenter\(request\.auth\);/g)).toHaveLength(2);
    expect(discoverySource).toContain('searchVehiclesDataSchema.parse');
    expect(discoverySource).toContain('searchVehiclesResultSchema.parse');
    expect(discoverySource).toContain('getVehicleDetailsDataSchema.parse');
    expect(discoverySource).toContain('getVehicleDetailsResultSchema.parse');
    expect(deploySource).toContain('getVehicleDetails');
    expect(deploySource).toContain('searchVehicles');
    expect(deploySource).toContain("from './discovery/discovery-callables.js';");
  });

  it('deploys provider-backed pickup search and resolution callables with App Check and secrets', () => {
    const pickupCallablesSource = readFileSync(new URL('./pickup-place-callables.ts', import.meta.url), 'utf8');
    expect(pickupCallablesSource).toContain('export const searchPickupPlaces = onCall');
    expect(pickupCallablesSource).toContain('export const resolvePickupPlace = onCall');
    expect(pickupCallablesSource).toMatch(/enforceAppCheck:\s*isProductionAppCheck\(\)/);
    expect(pickupCallablesSource).toContain('secrets: [googlePlacesSecret]');
    expect(pickupCallablesSource).toContain('requireAuthenticatedUser(request.auth)');
    expect(deploySource).toContain('searchPickupPlaces');
    expect(deploySource).toContain('resolvePickupPlace');
    expect(deploySource).toContain("from './discovery/pickup-place-callables.js';");
  });
});
