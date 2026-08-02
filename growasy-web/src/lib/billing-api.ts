import { apiClient } from '@/lib/api-client';
import type { DiscountLine, PriceQuote, PurchasableKey } from '@/lib/pricing-api';

/** Normal path: a Razorpay order to open in Checkout. */
export interface PaidCheckoutResponse {
  free: false;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
  listPrice: number;
  totalDiscount: number;
  coupon: (DiscountLine & { code: string }) | null;
  promo: DiscountLine | null;
}

/** Discounts covered the full price — the server already activated the plan. */
export interface FreeCheckoutResponse {
  free: true;
  planName: string;
  amount: 0;
  currency: string;
  cycle: 'monthly' | 'yearly';
  totalDiscount: number;
}

export type CheckoutResponse = PaidCheckoutResponse | FreeCheckoutResponse;

export type { PurchasableKey };

export interface VerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: PurchasableKey;
  cycle: 'monthly' | 'yearly';
}

export interface BillingConfig {
  enabled: boolean;
  keyId: string;
}

export const billingApi = {
  config: () => apiClient.get<BillingConfig>('/billing/config'),
  /** Price preview incl. plan promo + coupon validation. Throws ApiError on a bad code. */
  quote: (plan: PurchasableKey, cycle: 'monthly' | 'yearly', couponCode?: string) =>
    apiClient.post<PriceQuote>('/billing/quote', {
      plan,
      cycle,
      ...(couponCode ? { couponCode } : {}),
    }),
  checkout: (plan: PurchasableKey, cycle: 'monthly' | 'yearly', couponCode?: string) =>
    apiClient.post<CheckoutResponse>('/billing/checkout', {
      plan,
      cycle,
      ...(couponCode ? { couponCode } : {}),
    }),
  verify: (payload: VerifyPayload) =>
    apiClient.post<{ success: boolean; plan: string }>('/billing/verify', payload),
  cancel: () =>
    apiClient.post<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string }>('/billing/cancel'),
  dismissPending: () => apiClient.post<{ cleared: boolean }>('/billing/dismiss-pending'),
};
