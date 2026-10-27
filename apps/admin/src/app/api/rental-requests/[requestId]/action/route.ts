import { NextResponse } from 'next/server';

import {
  executeRentalRequestAction,
  type RentalRequestAdminAction,
} from '@/features/bookings/data/rental-request-action';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const VALID_ACTIONS: readonly RentalRequestAdminAction[] = [
  'approve',
  'decline',
  'open_payment_window',
  'confirm_pickup',
];

export async function POST(request: Request, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    if (!requestId) {
      return NextResponse.json({ error: 'Rental request ID is required.' }, { status: 400 });
    }

    const body = (await request.json()) as {
      action?: unknown;
      expectedVersion?: unknown;
      reason?: unknown;
      confirmedPickupTime?: unknown;
    };

    const action = typeof body.action === 'string' &&
      VALID_ACTIONS.includes(body.action as RentalRequestAdminAction)
      ? body.action as RentalRequestAdminAction
      : null;
    const expectedVersion = typeof body.expectedVersion === 'number' &&
      Number.isInteger(body.expectedVersion) && body.expectedVersion > 0
      ? body.expectedVersion
      : null;

    if (!action || expectedVersion === null) {
      return NextResponse.json(
        { error: 'A valid action and expected version are required.' },
        { status: 400 },
      );
    }

    const result = await executeRentalRequestAction({
      requestId,
      action,
      expectedVersion,
      ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
      ...(typeof body.confirmedPickupTime === 'string' ? { confirmedPickupTime: body.confirmedPickupTime } : {}),
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: 'The rental request action could not be completed. Please try again.' },
      { status: 500 },
    );
  }
}
