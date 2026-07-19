/**
 * Minimal typing of the Instagram webhook payload.
 * https://developers.facebook.com/docs/instagram-platform/webhooks
 */
export interface InstagramWebhookBody {
  object: string; // "instagram"
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  id: string; // the IG Business account id that owns the webhook (recipient)
  time: number;
  changes?: InstagramWebhookChange[];
  messaging?: InstagramMessagingEvent[]; // some DMs arrive Messenger-style here
}

export interface InstagramInboundMessage {
  mid: string;
  text?: string;
  is_echo?: boolean; // true for messages the business itself sent — ignore
  reply_to?: { story?: { id: string; url?: string }; mid?: string };
}

/** One incoming-message event under entry[].messaging[] (Messenger-style shape). */
export interface InstagramMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: InstagramInboundMessage;
}

export interface InstagramWebhookChange {
  field: string; // "comments", "messages", "mentions", ...
  value: InstagramChangeValue;
}

/**
 * A change `value` is field-specific. `comments` carries comment fields;
 * `messages` (Instagram Login delivers DMs/story replies here as a change, NOT
 * under entry[].messaging[]) carries sender/recipient/message. Every field is
 * optional so one type covers both.
 */
export interface InstagramChangeValue {
  // field === 'comments'
  id?: string; // comment id
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  parent_id?: string;
  // field === 'messages'
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: string | number;
  message?: InstagramInboundMessage;
}
