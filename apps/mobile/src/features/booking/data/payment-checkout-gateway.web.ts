import {
  initializeBookingPaymentCommandSchema,
  initializeBookingPaymentResultSchema,
  reconcilePaymentCommandSchema,
  reconcilePaymentResultSchema,
  type InitializeBookingPaymentResult,
  type ReconcilePaymentResult,
} from '@mmg/contracts/payment';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import type { PaymentCheckoutGateway } from './payment-checkout-gateway-core';

export { PaymentCheckoutSubmissionKeys } from './payment-checkout-gateway-core';
export type { PaymentCheckoutGateway } from './payment-checkout-gateway-core';

export class WebPaymentCheckoutGateway implements PaymentCheckoutGateway {
  constructor(private readonly customFunctions?: Functions) {}

  private get functions(): Functions {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async initializePayment(
    intentId: string,
    idempotencyKey: string,
  ): Promise<InitializeBookingPaymentResult> {
    const command = initializeBookingPaymentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey,
      data: { intentId },
    });
    const callable = httpsCallable(this.functions, 'initializeBookingPayment');
    const response = await callable(command);
    return parseCallableResult(
      initializeBookingPaymentResultSchema,
      response.data,
      'initializeBookingPayment',
    );
  }

  async reconcilePayment(
    intentId: string,
    idempotencyKey: string,
  ): Promise<ReconcilePaymentResult> {
    const command = reconcilePaymentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey,
      data: { intentId },
    });
    const callable = httpsCallable(this.functions, 'reconcilePayment');
    const response = await callable(command);
    return parseCallableResult(
      reconcilePaymentResultSchema,
      response.data,
      'reconcilePayment',
    );
  }
}

export function createPaymentCheckoutGateway(): PaymentCheckoutGateway {
  return new WebPaymentCheckoutGateway();
}
