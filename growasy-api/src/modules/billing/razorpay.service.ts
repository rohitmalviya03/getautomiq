import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfigService } from '../../config/app-config.service';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

/**
 * Thin Razorpay client — creates orders and verifies payment/webhook signatures
 * with the key secret. Uses the REST API directly (no SDK). All secrets come
 * from env via AppConfigService and never leave the server.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(private readonly config: AppConfigService) {}

  get keyId(): string {
    return this.config.razorpay.keyId;
  }

  isConfigured(): boolean {
    const { keyId, keySecret } = this.config.razorpay;
    return Boolean(keyId && keySecret);
  }

  private authHeader(): string {
    const { keyId, keySecret } = this.config.razorpay;
    return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  /** Creates a Razorpay order for the given amount (in paise). */
  async createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Payments are not configured.');
    }
    let res: Response;
    try {
      res = await fetch(`${RAZORPAY_API}/orders`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
      });
    } catch {
      throw new BadGatewayException('Could not reach the payment gateway.');
    }
    const body = (await res.json().catch(() => ({}))) as RazorpayOrder & {
      error?: { description?: string };
    };
    if (!res.ok || !body.id) {
      this.logger.warn({ status: res.status, err: body.error }, 'razorpay order creation failed');
      throw new BadGatewayException(body.error?.description ?? 'Payment order could not be created.');
    }
    return { id: body.id, amount: body.amount, currency: body.currency };
  }

  /** Verifies the checkout callback signature: HMAC(order_id|payment_id, secret). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.config.razorpay.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return safeEqual(expected, signature);
  }

  /** Verifies a Razorpay webhook body against X-Razorpay-Signature. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.razorpay.webhookSecret;
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
