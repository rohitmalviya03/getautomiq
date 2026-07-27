import { apiClient } from '@/lib/api-client';

export interface CheckoutResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
}

export interface VerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: 'STARTER' | 'GROWTH';
  cycle: 'monthly' | 'yearly';
}

export const billingApi = {
  checkout: (plan: 'STARTER' | 'GROWTH', cycle: 'monthly' | 'yearly') =>
    apiClient.post<CheckoutResponse>('/billing/checkout', { plan, cycle }),
  verify: (payload: VerifyPayload) =>
    apiClient.post<{ success: boolean; plan: string }>('/billing/verify', payload),
};
