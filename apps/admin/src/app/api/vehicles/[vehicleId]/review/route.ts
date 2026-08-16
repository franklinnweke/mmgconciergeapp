import { NextResponse } from 'next/server';

import { assertSameOrigin } from '@/features/auth/server/same-origin';
import { requireLiveStaffSession } from '@/features/auth/server/session';
import { FirestoreAdminVehicleGateway } from '@/features/vehicles/data/firestore-admin-vehicle-gateway';
import { FixtureAdminVehicleGateway } from '@/features/vehicles/data/fixture-admin-vehicle-gateway';

type RouteContext = {
  params: Promise<{ vehicleId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request.headers);

    const session = await requireLiveStaffSession();
    const { vehicleId } = await context.params;
    if (!vehicleId) {
      return NextResponse.json({ error: 'Vehicle ID is required.' }, { status: 400 });
    }

    const body = (await request.json()) as {
      action?: unknown;
      expectedVersion?: unknown;
      reason?: unknown;
    };

    const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
    const expectedVersion =
      typeof body.expectedVersion === 'number' &&
      Number.isInteger(body.expectedVersion) &&
      body.expectedVersion > 0
        ? body.expectedVersion
        : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!action || expectedVersion === null) {
      return NextResponse.json(
        { error: 'A valid action and expected version are required.' },
        { status: 400 },
      );
    }

    if (action === 'reject' && reason.length < 10) {
      return NextResponse.json(
        { error: 'A specific rejection reason is required.' },
        { status: 400 },
      );
    }

    const isFixture =
      process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
    const gateway = isFixture
      ? new FixtureAdminVehicleGateway()
      : new FirestoreAdminVehicleGateway();

    const result = await gateway.reviewVehicle({
      vehicleId,
      expectedVersion,
      action,
      reason: reason || undefined,
      staffEmail: session.email || session.uid,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vehicle review could not be completed.';
    const status = /origin|session|sign-in|access denied|unauthorized/i.test(message) ? 403 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
