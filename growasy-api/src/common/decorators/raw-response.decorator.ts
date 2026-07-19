import { SetMetadata } from '@nestjs/common';

export const IS_RAW_RESPONSE_KEY = 'isRawResponse';

/**
 * Opts a route (or whole controller) out of the global response envelope so its
 * return value is sent verbatim. Needed for machine-to-machine endpoints that
 * must return an exact body — e.g. the Meta webhook GET handshake, which expects
 * the raw `hub.challenge` string as plain text, not JSON-wrapped.
 */
export const RawResponse = () => SetMetadata(IS_RAW_RESPONSE_KEY, true);
