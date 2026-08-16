import { describe, expect, it, vi } from 'vitest';

import {
  contentTypesForImages,
  demoteImage,
  needsDemotion,
  needsPromotion,
  promoteImage,
  type PromotableImage,
} from './image-promotion.js';
import { publicVariantPath } from './image-processing.js';
import {
  promotedVehicleImageFixture,
  seededPublicObjects,
  seededVariantObjects,
  vehicleImageFixture,
} from './vehicle-repository-fake.js';
import {
  InMemoryVehicleStorageGateway,
  PUBLIC_VARIANT_CACHE_CONTROL,
} from './vehicle-storage-gateway.js';

function promotable(overrides: Partial<PromotableImage> = {}): PromotableImage {
  return {
    imageId: 'img-01',
    status: 'approved',
    variantPaths: { card: 'private/a/card' },
    publicVariantPaths: null,
    promotedAt: null,
    ...overrides,
  };
}

describe('needsPromotion', () => {
  it('promotes only an approved image on a servable listing', () => {
    expect(needsPromotion(promotable(), true)).toBe(true);
    expect(needsPromotion(promotable(), false)).toBe(false);
    expect(needsPromotion(promotable({ status: 'processed' }), true)).toBe(false);
    expect(needsPromotion(promotable({ status: 'rejected' }), true)).toBe(false);
  });

  it('does not promote an image that is already public', () => {
    expect(needsPromotion(promotable({ publicVariantPaths: { card: 'public/a' } }), true)).toBe(
      false,
    );
  });
});

describe('needsDemotion', () => {
  it('demotes when the listing stops being servable', () => {
    const published = promotable({ publicVariantPaths: { card: 'public/a' } });
    expect(needsDemotion(published, false)).toBe(true);
    expect(needsDemotion(published, true)).toBe(false);
  });

  it('demotes an image that lost approval even while the listing is servable', () => {
    const rejected = promotable({
      status: 'rejected',
      publicVariantPaths: { card: 'public/a' },
    });
    expect(needsDemotion(rejected, true)).toBe(true);
  });

  it('has nothing to demote when no public bytes are claimed', () => {
    expect(needsDemotion(promotable(), false)).toBe(false);
  });
});

describe('promoteImage', () => {
  it('copies every variant into the public prefix and reports where', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const promoted = await promoteImage(
      'veh-01',
      image,
      storageGateway,
      contentTypesForImages([image])[image.imageId],
    );

    expect(promoted).toEqual({
      thumb: publicVariantPath('veh-01', 'img-01', 'thumb'),
      card: publicVariantPath('veh-01', 'img-01', 'card'),
      detail: publicVariantPath('veh-01', 'img-01', 'detail'),
    });
    for (const path of Object.values(promoted)) {
      expect(storageGateway.objects.get(path)?.bytes).toBeDefined();
    }
  });

  it('strips the owner’s identity and caches the public object hard', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    // The private source carries ownerId, exactly as finalizeVehicleImage writes
    // it. Object metadata is readable by anyone who can read the object, and the
    // public prefix is world-readable.
    expect(storageGateway.objects.get(image.variantPaths.card!)?.metadata).toMatchObject({
      ownerId: 'owner-1',
    });

    await promoteImage('veh-01', image, storageGateway);

    const published = storageGateway.objects.get(publicVariantPath('veh-01', 'img-01', 'card'))!;
    expect(published.metadata).toEqual({});
    expect(published.cacheControl).toBe(PUBLIC_VARIANT_CACHE_CONTROL);
  });

  it('copies only the variants the record actually names', async () => {
    // A record with one variant must not cause reads of paths that were never
    // written — the promoter derives destinations from variantPaths, not from
    // the full variant list.
    const image = vehicleImageFixture({
      status: 'approved',
      variantPaths: { card: 'private/vehicle-uploads/owner-1/veh-01/img-01/variants/card' },
    });
    const storageGateway = new InMemoryVehicleStorageGateway({
      'private/vehicle-uploads/owner-1/veh-01/img-01/variants/card': {
        bytes: Buffer.from('card'),
        contentType: 'image/jpeg',
        metadata: {},
      },
    });

    const promoted = await promoteImage('veh-01', image, storageGateway);

    expect(Object.keys(promoted)).toEqual(['card']);
    expect([...storageGateway.objects.keys()].filter((path) => path.startsWith('public/'))).toEqual(
      [publicVariantPath('veh-01', 'img-01', 'card')],
    );
  });

  it('declares the content type the variant was encoded as', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    image.processing.variants.card!.contentType = 'image/webp';
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    await promoteImage('veh-01', image, storageGateway, contentTypesForImages([image])['img-01']);

    expect(
      storageGateway.objects.get(publicVariantPath('veh-01', 'img-01', 'card'))?.contentType,
    ).toBe('image/webp');
  });

  it('throws rather than reporting a partial promotion', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    // Only the thumb exists; the card copy fails. A caller that stamped the
    // returned paths on a partial success would record a missing object.
    const storageGateway = new InMemoryVehicleStorageGateway({
      [image.variantPaths.thumb!]: {
        bytes: Buffer.from('thumb'),
        contentType: 'image/jpeg',
        metadata: {},
      },
    });

    await expect(promoteImage('veh-01', image, storageGateway)).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('demoteImage', () => {
  it('deletes exactly the paths the record claims', async () => {
    const image = promotedVehicleImageFixture();
    const storageGateway = new InMemoryVehicleStorageGateway({
      ...seededVariantObjects([image]),
      ...seededPublicObjects([image]),
    });

    await demoteImage(image, storageGateway);

    expect([...storageGateway.objects.keys()].some((path) => path.startsWith('public/'))).toBe(
      false,
    );
    // The private variants survive: demotion unpublishes, it does not delete the
    // owner's photos.
    expect(storageGateway.objects.has(image.variantPaths.card!)).toBe(true);
  });

  it('deletes a path recorded under an older scheme', async () => {
    // Deliberately not a path publicVariantPath would produce. Deriving the
    // delete list instead of reading it would leave this object public forever.
    const legacyPath = 'public/vehicles/veh-01/legacy/img-01.jpg';
    const image = promotedVehicleImageFixture({ publicVariantPaths: { card: legacyPath } });
    const storageGateway = new InMemoryVehicleStorageGateway({
      [legacyPath]: { bytes: Buffer.from('legacy'), contentType: 'image/jpeg', metadata: {} },
    });

    await demoteImage(image, storageGateway);

    expect(storageGateway.objects.has(legacyPath)).toBe(false);
  });

  it('is idempotent, so a retried suspension is safe', async () => {
    const image = promotedVehicleImageFixture();
    const storageGateway = new InMemoryVehicleStorageGateway(seededPublicObjects([image]));

    await demoteImage(image, storageGateway);
    await expect(demoteImage(image, storageGateway)).resolves.toBeUndefined();
  });

  it('does nothing when the image claims no public paths', async () => {
    const storageGateway = new InMemoryVehicleStorageGateway();
    const deleteObject = vi.spyOn(storageGateway, 'deleteObject');

    await demoteImage(promotable(), storageGateway);

    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('contentTypesForImages', () => {
  it('reads the type off the stored processing facts, keyed by image', () => {
    const image = vehicleImageFixture();
    expect(contentTypesForImages([image])).toEqual({
      'img-01': { thumb: 'image/jpeg', card: 'image/jpeg', detail: 'image/jpeg' },
    });
  });

  it('reports nothing for an image with no recorded variants', () => {
    const image = vehicleImageFixture();
    image.processing.variants = {};
    expect(contentTypesForImages([image])).toEqual({ 'img-01': {} });
  });
});
