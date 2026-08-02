import { apiClient } from '@/lib/api-client';

export interface CheckoutResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
}

export type PurchasableKey = 'STARTER' | 'GROWTH' | 'PROFESSIONAL';

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
  checkout: (plan: PurchasableKey, cycle: 'monthly' | 'yearly') =>
    apiClient.post<CheckoutResponse>('/billing/checkout', { plan, cycle }),
  verify: (payload: VerifyPayload) =>
    apiClient.post<{ success: boolean; plan: string }>('/billing/verify', payload),
  cancel: () =>
    apiClient.post<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string }>('/billing/cancel'),
  dismissPending: () => apiClient.post<{ cleared: boolean }>('/billing/dismiss-pending'),
};
