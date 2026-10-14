import { AppError } from '@ecommerce/shared';

export interface PaymentDetails {
  method: 'card' | 'paypal' | 'cod';
  cardholderName?: string;
  cardNumber?: string;
  expiryMMYY?: string;
  cvc?: string;
}

export interface ChargeRequest {
  amount: number;
  currency: string;
  payment: PaymentDetails;
}

export interface ChargeResult {
  transactionId: string;
  approved: true;
  amount: number;
  currency: string;
  chargedAt: string;
}

/**
 * Mock payment gateway used by the resilience lab (real PSPs are out of scope).
 *
 * Test cards (digits only, spaces/dashes are ignored):
 *   4242 4242 4242 4242 — approved happy-path card
 *   4000 0000 0000 0002 — declined (classic "always declined" test card)
 *   4000 0000 0000 0000 — declined
 *
 * Any other card number is approved. `paypal` and `cod` never touch the card
 * rules and always succeed.
 */
export class PaymentGateway {
  constructor(private readonly delayMs = 150) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    // simulate PSP latency
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const digits = (request.payment.cardNumber ?? '').replace(/\D/g, '');
    if (digits.endsWith('0002') || digits.endsWith('0000')) {
      throw new AppError(402, 'PAYMENT_DECLINED', 'Card was declined. Try test card 4242 4242 4242 4242.');
    }

    return {
      transactionId: `txn-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      approved: true,
      amount: request.amount,
      currency: request.currency,
      chargedAt: new Date().toISOString(),
    };
  }
}

/** Singleton used by the running service; tests inject their own if needed. */
export const paymentGateway = new PaymentGateway();
