import {
  initializeBookingPaymentCommandSchema,
  initializeBookingPaymentResultSchema,
  reconcilePaymentCommandSchema,
  reconcilePaymentResultSchema,
  type InitializeBookingPaymentResult,
  type ReconcilePaymentResult,
} from '@mmg/contracts/payment';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import type { PaymentCheckoutGateway } from './payment-checkout-gateway-core';

export { PaymentCheckoutSubmissionKeys } from './payment-checkout-gateway-core';
export type { PaymentCheckoutGateway } from './payment-checkout-gateway-core';

export class NativePaymentCheckoutGateway implements PaymentCheckoutGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async initializePayment(
    intentId: string,
    idempotencyKey: string,
    mode: 'pay_first' | 'request_first' = 'pay_first',
  ): Promise<InitializeBookingPaymentResult> {
    const command = initializeBookingPaymentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey,
      data: { intentId },
    });
    const commandName = mode === 'request_first'
      ? 'initializeRentalRequestPayment'
      : 'initializeBookingPayment';
    const callable = httpsCallable(this.functions, commandName);
    const response = await callable(command);
    return parseCallableResult(
      initializeBookingPaymentResultSchema,
      response.data,
      commandName,
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
  return new NativePaymentCheckoutGateway();
}
