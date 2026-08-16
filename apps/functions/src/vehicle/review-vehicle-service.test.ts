import { describe, expect, it, vi } from 'vitest';

import { publicVariantPath } from './image-processing.js';
import { reviewVehicle } from './review-vehicle-service.js';
import {
  promotedVehicleImageFixture,
  seededPublicObjects,
  seededVariantObjects,
  seededVehicleRepository,
  vehicleImageFixture,
} from './vehicle-repository-fake.js';
import {
  InMemoryVehicleStorageGateway,
  PUBLIC_VARIANT_CACHE_CONTROL,
} from './vehicle-storage-gateway.js';

const now = new Date('2026-08-16T12:00:00Z');
const staffActor = { uid: 'staff-admin-01', role: 'vehicle_admin' as const };

const fullChecklist = {
  images_complete_and_legible: true,
  specs_match_images: true,
  plate_matches_documents: true,
  lagos_base_plausible: true,
  rate_plausible: true,
  chauffeur_delivery_included: true,
  no_fraud_indicators: true,
};

function approveCommand(idempotencyKey: string) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: {
      vehicleId: 'veh-01',
      expectedVersion: 1,
      decision: 'approve' as const,
      checklist: fullChecklist,
    },
  };
}

function decisionCommand(
  idempotencyKey: string,
  decision: 'reject' | 'suspend',
  reason: string,
) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: { vehicleId: 'veh-01', expectedVersion: 1, decision, reason },
  };
}

describe('reviewVehicle service', () => {
  it('approves a pending listing without publishing anything', async () => {
    const image = vehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'paused',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const result = await reviewVehicle(approveCommand('key-review-approve'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(result.result.toStatus).toBe('approved');
    expect(result.result.version).toBe(2);

    // Approval alone does not publish: the owner has not activated the listing,
    // so nothing about it is servable and no byte reaches the public prefix.
    expect(repository.vehicle().moderationStatus).toBe('approved');
    expect(repository.vehicle().visibility).toBe('paused');
    expect(repository.vehicle().discoverable).toBe(false);
    expect(repository.image('img-01').status).toBe('approved');
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect([...storageGateway.objects.keys()].some((path) => path.startsWith('public/'))).toBe(
      false,
    );

    expect(repository.adminLogs).toHaveLength(1);
    expect(repository.adminLogs[0]!.action).toBe('vehicle.decided_approve');
    expect(repository.auditEventTypes()).toEqual(['vehicle.decided']);
  });

  it('refuses approval when the checklist is incomplete', async () => {
    const repository = seededVehicleRepository({ moderationStatus: 'pending_review' });

    // The contract catches this first — every checklist key is `z.literal(true)`
    // — so the reachable error is the schema's, not the service's `allChecked`
    // guard. That guard stays as defence in depth: it is the one that holds if
    // the schema is ever loosened to plain booleans.
    await expect(
      reviewVehicle(
        {
          schemaVersion: 1 as const,
          idempotencyKey: 'key-review-partial',
          data: {
            vehicleId: 'veh-01',
            expectedVersion: 1,
            decision: 'approve' as const,
            checklist: { ...fullChecklist, no_fraud_indicators: false },
          },
        },
        staffActor,
        { repository, storageGateway: new InMemoryVehicleStorageGateway(), now: () => now },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    expect(repository.vehicle().moderationStatus).toBe('pending_review');
    expect(repository.auditEvents).toHaveLength(0);
  });

  it('rejects a listing with a mandatory reason', async () => {
    const repository = seededVehicleRepository({ moderationStatus: 'pending_review' });

    const result = await reviewVehicle(
      decisionCommand(
        'key-review-reject',
        'reject',
        'The uploaded vehicle photos are too dark and plate is illegible.',
      ),
      staffActor,
      { repository, storageGateway: new InMemoryVehicleStorageGateway(), now: () => now },
    );

    expect(result.result.toStatus).toBe('rejected');
    expect(repository.vehicle().moderationStatus).toBe('rejected');
    expect(repository.vehicle().lastDecisionReason).toContain(
      'uploaded vehicle photos are too dark',
    );
    expect(repository.image('img-01').status).toBe('rejected');
    expect(repository.adminLogs[0]!.action).toBe('vehicle.decided_reject');
  });

  it('publishes the images when a revision is approved on an already-active listing', async () => {
    // The reachable promotion path through review: the owner activated the
    // listing earlier, resubmission moved it back to pending_review without
    // touching visibility, and this approval makes it servable again.
    const image = vehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'active',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const result = await reviewVehicle(approveCommand('key-review-revision'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(result.result.visibility).toBe('active');

    for (const variant of ['thumb', 'card', 'detail'] as const) {
      const path = publicVariantPath('veh-01', 'img-01', variant);
      expect(storageGateway.objects.get(path)?.cacheControl).toBe(PUBLIC_VARIANT_CACHE_CONTROL);
      expect(storageGateway.objects.get(path)?.metadata).toEqual({});
      expect(repository.image('img-01').publicVariantPaths?.[variant]).toBe(path);
    }
    expect(repository.image('img-01').promotedAt).toBe(now.toISOString());
    expect(repository.vehicle().discoverable).toBe(true);
    expect(repository.auditEventTypes()).toEqual(['vehicle.decided', 'vehicle.images_published']);
  });

  it('takes the photos down when an active listing is suspended', async () => {
    const image = promotedVehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway({
      ...seededVariantObjects([image]),
      ...seededPublicObjects([image]),
    });

    const result = await reviewVehicle(
      decisionCommand(
        'key-review-suspend',
        'suspend',
        'Owner insurance document expired and renewal is pending.',
      ),
      staffActor,
      { repository, storageGateway, now: () => now },
    );

    expect(result.result.toStatus).toBe('suspended');
    expect(repository.vehicle().visibility).toBe('paused');
    expect(repository.vehicle().discoverable).toBe(false);

    for (const path of Object.values(image.publicVariantPaths!)) {
      expect(storageGateway.objects.has(path)).toBe(false);
      expect(storageGateway.deleted).toContain(path);
    }
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect(repository.image('img-01').promotedAt).toBeNull();

    // The private variants are untouched — a suspension is reversible, and a
    // restore must not need the owner to re-upload.
    expect(storageGateway.objects.has(image.variantPaths.card!)).toBe(true);
  });

  it('takes the photos down and marks the images rejected when an active listing is rejected', async () => {
    const image = promotedVehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'active',
      discoverable: true,
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway({
      ...seededVariantObjects([image]),
      ...seededPublicObjects([image]),
    });

    await reviewVehicle(
      decisionCommand(
        'key-review-reject-live',
        'reject',
        'Plate on the documents does not match the plate visible in the photos.',
      ),
      staffActor,
      { repository, storageGateway, now: () => now },
    );

    expect(repository.image('img-01').status).toBe('rejected');
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect([...storageGateway.objects.keys()].some((path) => path.startsWith('public/'))).toBe(
      false,
    );
    expect(repository.vehicle().discoverable).toBe(false);
  });

  it('keeps the listing undiscoverable when the copy fails', async () => {
    const image = vehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'active',
      images: [image],
    });
    // Empty bucket: the source variants are missing, so every copy throws.
    const storageGateway = new InMemoryVehicleStorageGateway();
    const onPromotionFailure = vi.fn();

    const result = await reviewVehicle(approveCommand('key-review-copy-fail'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
      onPromotionFailure,
    });

    // The moderator's ruling is durable and is not reported as failed.
    expect(result.result.toStatus).toBe('approved');
    expect(repository.vehicle().moderationStatus).toBe('approved');
    expect(onPromotionFailure).toHaveBeenCalledOnce();
    expect(repository.vehicle().discoverable).toBe(false);
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect(repository.auditEventTypes()).toEqual([
      'vehicle.decided',
      'vehicle.publication_incomplete',
    ]);
  });

  it('stamps no public path when the owner pauses the listing mid-publication', async () => {
    const image = vehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'active',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    // The pause lands after the decision committed and after the bytes were
    // copied, but before publication records where they went.
    repository.beforeTransaction = (index) => {
      if (index === 2) {
        repository.vehicles.set('veh-01', { ...repository.vehicle(), visibility: 'paused' });
      }
    };

    await reviewVehicle(approveCommand('key-review-superseded'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    // The newer state wins: the listing stays paused and undiscoverable, and no
    // record claims the public objects that were copied.
    expect(repository.vehicle().visibility).toBe('paused');
    expect(repository.vehicle().discoverable).toBe(false);
    expect(repository.image('img-01').publicVariantPaths).toBeNull();

    // Those objects are the accepted worst case — unreachable orphans — and the
    // audit event names them so a reconciler can find them.
    expect(storageGateway.objects.has(publicVariantPath('veh-01', 'img-01', 'card'))).toBe(true);
    const published = repository.auditEvents.at(-1)!;
    expect(published.eventType).toBe('vehicle.images_published');
    expect(published.details).toMatchObject({
      superseded: true,
      promotedImageIds: [],
      abandonedPromotionImageIds: ['img-01'],
    });
  });

  it('replays a decision without republishing', async () => {
    const image = vehicleImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'pending_review',
      visibility: 'active',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const first = await reviewVehicle(approveCommand('key-review-replay'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    const transactionsAfterFirst = repository.transactionCount;
    const second = await reviewVehicle(approveCommand('key-review-replay'), staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(second).toEqual(first);
    // One transaction to read the idempotency record, and no publication pass.
    expect(repository.transactionCount).toBe(transactionsAfterFirst + 1);
    expect(repository.auditEventTypes()).toEqual(['vehicle.decided', 'vehicle.images_published']);
  });

  it('conflicts when the same key carries a different decision', async () => {
    const repository = seededVehicleRepository({ moderationStatus: 'pending_review' });
    const storageGateway = new InMemoryVehicleStorageGateway();

    await reviewVehicle(
      decisionCommand('key-review-conflict', 'reject', 'Photos do not show the vehicle plate.'),
      staffActor,
      { repository, storageGateway, now: () => now },
    );

    await expect(
      reviewVehicle(
        decisionCommand(
          'key-review-conflict',
          'suspend',
          'A different decision under a key that was already used.',
        ),
        staffActor,
        { repository, storageGateway, now: () => now },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});
