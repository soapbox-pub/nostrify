import type { NostrEvent } from "@nostrify/types";
import { fromBase64, toBase64 } from "@smithy/util-base64";

import { NSchema as n } from "../NSchema.ts";

/** Nostr base64 helper utilities. */
export class N64 {
  /** Encode an event as a base64 string. */
  static encodeEvent(event: NostrEvent): string {
    return toBase64(JSON.stringify(event));
  }

  /** Decode an event from a base64 string. Validates the event's structure but does not verify its signature. */
  static decodeEvent(base64: string): NostrEvent {
    const bytes = fromBase64(base64);
    const text = new TextDecoder().decode(bytes);

    return n
      .json()
      .pipe(n.event())
      .parse(text);
  }
}
