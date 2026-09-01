// Firebase deployment entrypoint. Explicit exports override or add focused
// network boundaries without duplicating the rest of the function surface.
export * from './index.js';
export {
  getVehicleDetails,
  searchVehicles,
} from './discovery/discovery-callables.js';
export {
  initializeBookingPayment,
  paystackWebhook,
  processPaystackPaymentEvent,
  reconcilePayment,
} from './booking/payment-callables.js';
