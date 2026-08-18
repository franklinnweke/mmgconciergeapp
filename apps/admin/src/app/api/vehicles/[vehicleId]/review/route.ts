import { NextResponse } from 'next/server';

import {
  executeReviewVehicleAction,
  type ExecuteReviewVehicleInput,
} from '@/features/vehicles/data/review-vehicle-action';

type RouteContext = {
  params: Promise<{ vehicleId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { vehicleId } = await context.params;
    if (!vehicleId) {
      return NextResponse.json({ error: 'Vehicle ID is required.' }, { status: 400 });
    }

    const body = (await request.json()) as {
      decision?: unknown;
      action?: unknown;
      expectedVersion?: unknown;
      reason?: unknown;
      checklist?: unknown;
    };

    const decision =
      body.decision === 'approve' ||
      body.decision === 'reject' ||
      body.decision === 'suspend' ||
      body.decision === 'restore' ||
      body.decision === 'start_review'
        ? body.decision
        : body.action === 'approve'
          ? 'approve'
          : body.action === 'reject'
            ? 'reject'
            : null;

    const expectedVersion =
      typeof body.expectedVersion === 'number' &&
      Number.isInteger(body.expectedVersion) &&
      body.expectedVersion > 0
        ? body.expectedVersion
        : null;

    if (!decision || expectedVersion === null) {
      return NextResponse.json(
        { error: 'A valid review decision and expected version are required.' },
        { status: 400 },
      );
    }

    const result = await executeReviewVehicleAction({
      vehicleId,
      expectedVersion,
      decision,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      checklist:
        typeof body.checklist === 'object' && body.checklist !== null
          ? (body.checklist as ExecuteReviewVehicleInput['checklist'])
          : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vehicle review could not be completed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
