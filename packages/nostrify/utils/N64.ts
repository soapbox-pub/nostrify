import type { NostrEvent } from "@nostrify/types";
import { fromBase64, toBase64 } from "@smithy/util-base64";

import { NSchema as n } from "../NSchema.ts";

/** Nostr base64 helper utilities. */
export class N64 {
  /** Encode an event as a base64 string. */
  static encodeEvent(event: NostrEvent): string {
    return toBase64(JSON.stringify(event));
  }

  /**
   * Encode an event as a Base64 URL-safe string without padding (Base64url, as used by JWTs).
   * Required by Blossom [BUD-11](https://github.com/hzrd149/blossom/blob/master/buds/11.md) for the `Authorization` header.
   */
  static encodeEventUrl(event: NostrEvent): string {
    return toBase64(JSON.stringify(event))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Decode an event from a base64 string. Validates the event's structure but does not verify its signature.
   * Accepts both standard base64 and URL-safe (Base64url) encodings, with or without padding.
   */
  static decodeEvent(base64: string): NostrEvent {
    let normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) {
      normalized += "=";
    }

    const bytes = fromBase64(normalized);
    const text = new TextDecoder().decode(bytes);

    return n
      .json()
      .pipe(n.event())
      .parse(text);
  }
}
