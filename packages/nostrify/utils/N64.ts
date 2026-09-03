import type { NostrEvent } from "@nostrify/types";
import { base64, base64urlnopad } from "@scure/base";

import { NSchema as n } from "../NSchema.ts";

/** Parser for encoded events. Built once, since `NSchema` constructs a new schema tree on every call. */
const eventSchema = n.json().pipe(n.event());

/** Nostr base64 helper utilities. */
export class N64 {
  /** Encode an event as a base64 string. */
  static encodeEvent(event: NostrEvent): string {
    return base64.encode(N64.#serialize(event));
  }

  /**
   * Encode an event as a Base64 URL-safe string without padding (Base64url, as used by JWTs).
   * Required by Blossom [BUD-11](https://github.com/hzrd149/blossom/blob/master/buds/11.md) for the `Authorization` header.
   */
  static encodeEventUrl(event: NostrEvent): string {
    return base64urlnopad.encode(N64.#serialize(event));
  }

  /**
   * Decode an event from a base64 string. Validates the event's structure but does not verify its signature.
   * Accepts both standard base64 and URL-safe (Base64url) encodings, with or without padding.
   */
  static decodeEvent(encoded: string): NostrEvent {
    let normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) {
      normalized += "=";
    }

    const bytes = base64.decode(normalized);
    const text = new TextDecoder().decode(bytes);

    return eventSchema.parse(text);
  }

  /** JSON-encode an event to UTF-8 bytes, which is what the base64 codecs take. */
  static #serialize(event: NostrEvent): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(event));
  }
}
