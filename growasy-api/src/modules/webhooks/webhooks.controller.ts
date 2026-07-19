import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { InstagramWebhookBody } from './instagram-webhook.types';

/**
 * Meta webhook endpoints. Version-neutral and public (Meta calls them
 * unauthenticated; security comes from the verify token + HMAC signature).
 * Excluded from Swagger — it's a machine-to-machine contract, not a client API.
 */
@ApiExcludeController()
@RawResponse() // Meta needs the raw hub.challenge string, not the JSON envelope
@Controller({ path: 'webhook/instagram', version: VERSION_NEUTRAL })
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /** Meta verification handshake. */
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.webhooksService.verifyChallenge(mode, verifyToken, challenge);
    if (result === null) {
      throw new ForbiddenException('Webhook verification failed');
    }
    return result;
  }

  /**
   * Event receiver. Verifies the HMAC signature, then returns 200 immediately
   * after enqueuing one job per comment; no DB or Meta API call happens in this
   * request — the worker does all of that, so we never approach Meta's ~20s timeout.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!this.webhooksService.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body as InstagramWebhookBody;
    this.webhooksService.logIncoming(body);
    const comments = this.webhooksService.extractComments(body);
    if (comments.length > 0) {
      await this.webhooksService.enqueueComments(comments);
    }
    const messages = this.webhooksService.extractMessages(body);
    if (messages.length > 0) {
      await this.webhooksService.enqueueMessages(messages);
    }
    return { received: true };
  }
}
