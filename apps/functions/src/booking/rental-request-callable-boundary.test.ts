import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const callableSource = readFileSync(new URL('./rental-request-callables.ts', import.meta.url), 'utf8');
const deploySource = readFileSync(new URL('../deploy.ts', import.meta.url), 'utf8');

describe('rental request callable privacy boundary', () => {
  it('serves renter request history through verified-auth server projection', () => {
    expect(callableSource).toContain('export const listRenterRentalRequests = onCall');
    expect(callableSource).toContain('listRenterRentalRequestsCommandSchema.parse(request.data)');
    expect(callableSource).toContain('const renterId = requireVerifiedRenter(request.auth)');
    expect(callableSource).toContain('new FirestoreRenterRentalRequestQuery().list(renterId, command.includePickupDispatch === true)');
  });

  it('keeps owner request history behind owner auth and deploys both safe list callables', () => {
    expect(callableSource).toContain('export const listOwnerRentalRequests = onCall');
    expect(callableSource).toContain('const owner = requireVerifiedEmailOwnerAuth(request.auth)');
    expect(deploySource).toContain('listOwnerRentalRequests');
    expect(deploySource).toContain('listRenterRentalRequests');
    expect(deploySource).toContain("from './booking/rental-request-callables.js';");
  });
});
