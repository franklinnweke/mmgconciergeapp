import {
  CreateBookingIntentCommand,
  CreateBookingIntentData,
  CreateBookingIntentResult,
  InitializeBookingPaymentCommand,
  InitializeBookingPaymentData,
  InitializeBookingPaymentResult,
  OwnerConfirmBookingCommand,
  OwnerConfirmBookingData,
  OwnerConfirmBookingResult,
  OwnerRejectBookingCommand,
  OwnerRejectBookingData,
  OwnerRejectBookingResult,
  VerifyBookingPaymentCommand,
  VerifyBookingPaymentData,
  VerifyBookingPaymentResult,
} from '@mmg/contracts';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { BookingPaymentGateway } from './booking-payment-gateway';

export class WebBookingPaymentGateway implements BookingPaymentGateway {
  private getFunctionsInstance() {
    return getFunctions(getApp(), 'africa-south1');
  }

  private generateIdempotencyKey(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async createBookingIntent(data: CreateBookingIntentData): Promise<CreateBookingIntentResult['result']> {
    const callable = httpsCallable(this.getFunctionsInstance(), 'createBookingIntent');
    const command: CreateBookingIntentCommand = {
      schemaVersion: 1,
      idempotencyKey: this.generateIdempotencyKey('intent'),
      data,
    };
    const response = await callable(command);
    return (response.data as CreateBookingIntentResult).result;
  }

  async initializePayment(data: InitializeBookingPaymentData): Promise<InitializeBookingPaymentResult['result']> {
    const callable = httpsCallable(this.getFunctionsInstance(), 'initializeBookingPayment');
    const command: InitializeBookingPaymentCommand = {
      schemaVersion: 1,
      idempotencyKey: this.generateIdempotencyKey('init_pay'),
      data,
    };
    const response = await callable(command);
    return (response.data as InitializeBookingPaymentResult).result;
  }

  async verifyPayment(data: VerifyBookingPaymentData): Promise<VerifyBookingPaymentResult['result']> {
    const callable = httpsCallable(this.getFunctionsInstance(), 'verifyBookingPayment');
    const command: VerifyBookingPaymentCommand = {
      schemaVersion: 1,
      idempotencyKey: this.generateIdempotencyKey('verify_pay'),
      data,
    };
    const response = await callable(command);
    return (response.data as VerifyBookingPaymentResult).result;
  }

  async ownerConfirmBooking(data: OwnerConfirmBookingData): Promise<OwnerConfirmBookingResult['result']> {
    const callable = httpsCallable(this.getFunctionsInstance(), 'ownerConfirmBooking');
    const command: OwnerConfirmBookingCommand = {
      schemaVersion: 1,
      idempotencyKey: this.generateIdempotencyKey('owner_confirm'),
      data,
    };
    const response = await callable(command);
    return (response.data as OwnerConfirmBookingResult).result;
  }

  async ownerRejectBooking(data: OwnerRejectBookingData): Promise<OwnerRejectBookingResult['result']> {
    const callable = httpsCallable(this.getFunctionsInstance(), 'ownerRejectBooking');
    const command: OwnerRejectBookingCommand = {
      schemaVersion: 1,
      idempotencyKey: this.generateIdempotencyKey('owner_reject'),
      data,
    };
    const response = await callable(command);
    return (response.data as OwnerRejectBookingResult).result;
  }
}
export function createBookingPaymentGateway(): BookingPaymentGateway {
  return new WebBookingPaymentGateway();
}

export const bookingPaymentGateway: BookingPaymentGateway = createBookingPaymentGateway();
