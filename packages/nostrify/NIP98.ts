import type { NostrEvent } from "@nostrify/types";
import { hex } from "@scure/base";
import { verifyEvent as _verifyEvent } from "nostr-tools";

import { N64 } from "./utils/N64.ts";
import { readCapped } from "./utils/readCapped.ts";

/** [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP auth. */
export class NIP98 {
  /** Generate an auth event template from a Request. */
  static async template(
    request: Request,
    opts?: { validatePayload?: boolean },
  ): Promise<Omit<NostrEvent, "id" | "pubkey" | "sig">> {
    const {
      validatePayload = ["POST", "PUT", "PATCH"].includes(request.method),
    } = opts ?? {};
    const { method, url } = request;

    const tags = [
      ["method", method],
      ["u", url],
    ];

    if (validatePayload) {
      const buffer = await request.clone().arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);

      tags.push(["payload", hex.encode(new Uint8Array(digest))]);
    }

    return {
      kind: 27235,
      content: "",
      tags,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Compare the auth event with the request, throwing a human-readable error if validation fails.
   *
   * Performs the four checks NIP-98 requires of a server — kind, timestamp
   * window, `u`, `method` — plus the optional `payload` check.
   *
   * NIP-98 leaves the body binding to the server's discretion: clients SHOULD
   * send a `payload` tag when the request has a body, and servers MAY check it.
   * `validatePayload` decides which side of that this implementation takes.
   * When it's on — the default for `POST`, `PUT` and `PATCH` — the tag is
   * *required*, since a token that carries no payload tag binds only the URL
   * and method, and can therefore be replayed against the same endpoint with a
   * body of the attacker's choosing. Servers that must accept clients which
   * omit the tag can set it to `false`, accepting that trade. A payload tag
   * that *is* present is always checked, whatever the setting.
   *
   * Two things this deliberately does not do, both of which are the caller's:
   *
   * - **Authorization.** A valid token only proves the holder of `event.pubkey`
   *   made this request. Deciding whether *that* pubkey may do so is yours.
   * - **Replay defense.** NIP-98 has no nonce, so within the `maxAge` window a
   *   captured token can be replayed verbatim against the same URL, method and
   *   body. Servers that need exactly-once semantics should remember event IDs
   *   for the length of the window and reject repeats.
   */
  static async verify(
    request: Request,
    opts?: {
      /**
       * How far, in milliseconds, `created_at` may be from now — in either
       * direction. Default: `60_000`, the window NIP-98 suggests.
       */
      maxAge?: number;
      /** Require and check the `payload` tag. Default: `true` for `POST`, `PUT` and `PATCH`. */
      validatePayload?: boolean;
      /**
       * Largest body, in bytes, that will be read to check the `payload` tag.
       * Default: `Infinity`.
       *
       * Checking the tag means hashing the body, and hashing it means holding
       * it. A signature proves only that *somebody* signed — anyone can mint a
       * keypair and a well-formed token — so an unauthenticated caller can
       * reach this point at will and hand the process a body of whatever size
       * it cares to send. The default preserves the old behavior, since a
       * server that legitimately accepts large uploads would otherwise start
       * rejecting them; anything exposed to untrusted callers should set this.
       */
      maxPayloadSize?: number;
      verifyEvent?: (event: NostrEvent) => boolean;
    },
  ): Promise<NostrEvent> {
    const {
      maxAge = 60_000,
      validatePayload = ["POST", "PUT", "PATCH"].includes(request.method),
      maxPayloadSize = Infinity,
      verifyEvent = _verifyEvent,
    } = opts ?? {};

    const header = request.headers.get("authorization");
    if (!header) {
      throw new Error("Missing Nostr authorization header");
    }

    const token = header.match(/^Nostr (.+)$/)?.[1];
    if (!token) {
      throw new Error("Missing Nostr authorization token");
    }

    let event: NostrEvent;
    try {
      event = N64.decodeEvent(token);
    } catch {
      throw new Error("Invalid token");
    }

    if (!verifyEvent(event)) {
      throw new Error("Event signature is invalid");
    }

    const skew = Date.now() - (event.created_at * 1_000);
    const u = event.tags.find(([name]) => name === "u")?.[1];
    const method = event.tags.find(([name]) => name === "method")?.[1];
    const payload = event.tags.find(([name]) => name === "payload")?.[1];

    if (event.kind !== 27235) {
      throw new Error("Event must be kind 27235");
    }
    if (u !== request.url) {
      throw new Error("Event URL does not match request URL");
    }
    if (method !== request.method) {
      throw new Error("Event method does not match HTTP request method");
    }
    // NIP-98 asks for a *window* around `created_at`, not a deadline. Bounding
    // only the past leaves a future-dated event valid forever: its age is
    // negative, so it never reaches `maxAge`, and one token minted with a
    // `created_at` a year out never stops being accepted.
    if (skew >= maxAge) {
      throw new Error("Event expired");
    }
    if (skew <= -maxAge) {
      throw new Error("Event is dated too far in the future");
    }
    if (validatePayload && payload === undefined) {
      throw new Error("Event is missing the payload tag");
    }
    if (payload !== undefined) {
      const body = await NIP98.body(request, maxPayloadSize);
      const digest = await crypto.subtle.digest("SHA-256", body);
      const hexed = hex.encode(new Uint8Array(digest));

      if (hexed !== payload) {
        throw new Error("Event payload does not match request body");
      }
    }

    return event;
  }

  /** Read the request body, refusing to hold more than `maxPayloadSize` bytes of it. */
  private static async body(
    request: Request,
    maxPayloadSize: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (maxPayloadSize === Infinity) {
      return new Uint8Array(await request.clone().arrayBuffer());
    }

    // Worth checking, since it lets an oversized body be turned away before any
    // of it is read — but only as a shortcut. It is absent on a chunked body,
    // and a sender is under no obligation to have told the truth in it, so the
    // running total below is what actually enforces the limit.
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxPayloadSize) {
      throw new Error("Request body is too large to verify");
    }

    const stream = request.clone().body;
    if (!stream) {
      return new Uint8Array();
    }

    return readCapped(
      stream,
      maxPayloadSize,
      "Request body is too large to verify",
    );
  }
}
