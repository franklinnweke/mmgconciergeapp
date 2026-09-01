import type {
  PaymentGatewayInitializeInput,
  PaymentGatewayInitializeResult,
  PaymentGatewayVerifyInput,
  PaymentGatewayVerifyResult,
} from '@mmg/contracts/payment';

export interface PaymentGateway {
  initializePayment(input: PaymentGatewayInitializeInput): Promise<PaymentGatewayInitializeResult>;
  verifyPayment(input: PaymentGatewayVerifyInput): Promise<PaymentGatewayVerifyResult>;
}
