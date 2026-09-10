import { defineSecret } from 'firebase-functions/params';

/**
 * The Paystack credential is deliberately defined in one module. Only the
 * payment entrypoints that explicitly include this parameter in their runtime
 * options may access the secret.
 */
export const paystackSecret: ReturnType<typeof defineSecret> = defineSecret('PAYSTACK_SECRET_KEY');
