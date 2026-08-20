import { describe, expect, it, vi } from 'vitest';
import { createDiscoveryGateway } from './firestore-discovery-gateway.web';
import { previewDiscoveryGateway } from './preview-discovery-gateway';

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

describe('previewDiscoveryGateway', () => {
  it('returns all 4 preview vehicles ordered by distance in getFeaturedVehicles', async () => {
    const featured = await previewDiscoveryGateway.getFeaturedVehicles();
    expect(featured).toHaveLength(4);

    // Verify distance sorting: 3.2, 5.7, 6.1, 8.4
    expect(featured[0].distanceKm).toBe(3.2);
    expect(featured[1].distanceKm).toBe(5.7);
    expect(featured[2].distanceKm).toBe(6.1);
    expect(featured[3].distanceKm).toBe(8.4);

    // Verify Prado-led: first 3 are Prado models, last is Executive Saloon
    expect(featured[0].displayName).toContain('Prado');
    expect(featured[1].displayName).toContain('Prado');
    expect(featured[2].displayName).toContain('Prado');
    expect(featured[3].displayName).toContain('Executive Saloon');
  });

  it('retrieves individual preview vehicles by ID truthfully', async () => {
    const pearl = await previewDiscoveryGateway.getVehicleById('preview-prado-pearl');
    expect(pearl).not.toBeNull();
    expect(pearl?.id).toBe('preview-prado-pearl');
    expect(pearl?.displayName).toBe('Prado 150 — Pearl');
    expect(pearl?.category).toBe('executive_suv');
    expect(pearl?.chauffeurPolicy).toBe('included');
    expect(pearl?.deliveryPolicy).toBe('included');

    const hero = await previewDiscoveryGateway.getVehicleById('preview-prado-250');
    expect(hero).not.toBeNull();
    expect(hero?.id).toBe('preview-prado-250');
    expect(hero?.displayName).toBe('Prado 250 — Obsidian');

    const graphite = await previewDiscoveryGateway.getVehicleById('preview-prado-graphite');
    expect(graphite).not.toBeNull();
    expect(graphite?.id).toBe('preview-prado-graphite');

    const sedan = await previewDiscoveryGateway.getVehicleById('preview-executive-saloon');
    expect(sedan).not.toBeNull();
    expect(sedan?.id).toBe('preview-executive-saloon');
    expect(sedan?.category).toBe('executive_sedan');

    const missing = await previewDiscoveryGateway.getVehicleById('non-existent-id');
    expect(missing).toBeNull();
  });

  it('filters preview vehicles by category, area, and query', async () => {
    const suvs = await previewDiscoveryGateway.searchVehicles({ category: 'executive_suv' });
    expect(suvs).toHaveLength(3);

    const sedans = await previewDiscoveryGateway.searchVehicles({ category: 'executive_sedan' });
    expect(sedans).toHaveLength(1);
    expect(sedans[0].id).toBe('preview-executive-saloon');

    const ikoyi = await previewDiscoveryGateway.searchVehicles({ areaLabel: 'Ikoyi' });
    expect(ikoyi).toHaveLength(1);
    expect(ikoyi[0].id).toBe('preview-prado-250');

    const queried = await previewDiscoveryGateway.searchVehicles({ query: 'Obsidian' });
    expect(queried).toHaveLength(2); // Prado 250 Obsidian and Obsidian Executive Saloon
  });

  it('createDiscoveryGateway on web defaults to previewDiscoveryGateway when no firestore is provided', () => {
    const defaultGateway = createDiscoveryGateway();
    expect(defaultGateway).toBe(previewDiscoveryGateway);
  });
});
