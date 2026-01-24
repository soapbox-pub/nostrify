import { z } from "zod";

import type { NostrFilter } from "@nostrify/types";

/**
 * A suite of [zod](https://github.com/colinhacks/zod) schemas for Nostr.
 *
 * ```ts
 * import { NSchema as n } from '@nostrify/nostrify';
 *
 * const event: NostrEvent = n.event().parse(eventData);
 * const metadata: NostrMetadata = n.json().pipe(n.metadata()).parse(event.content);
 * const msg: NostrRelayMsg = n.relayMsg().parse(e.data);
 * const nsec: `nsec1${string}` = n.bech32('nsec').parse(token);
 * ```
 */
class NSchema {
  /** Schema to validate Nostr hex IDs such as event IDs and pubkeys. */
  static id() {
    return z.string().regex(/^[0-9a-f]{64}$/);
  }

  /** Nostr event schema. */
  static event() {
    return z.object({
      id: NSchema.id(),
      kind: z.number().int().nonnegative(),
      pubkey: NSchema.id(),
      tags: z.string().array().array(),
      content: z.string(),
      created_at: z.number().int().nonnegative(),
      sig: z.string(),
    }).required({
      id: true,
      kind: true,
      pubkey: true,
      tags: true,
      content: true,
      created_at: true,
      sig: true,
    });
  }

  /** Nostr filter schema. */
  static filter() {
    return z.looseObject({
      kinds: z.number().int().nonnegative().array().optional(),
      ids: NSchema.id().array().optional(),
      authors: NSchema.id().array().optional(),
      since: z.number().int().nonnegative().optional(),
      until: z.number().int().nonnegative().optional(),
      limit: z.number().int().nonnegative().optional(),
      search: z.string().optional(),
    })
      .transform((value) => {
        const keys = [
          "kinds",
          "ids",
          "authors",
          "since",
          "until",
          "limit",
          "search",
        ];
        return Object.entries(value).reduce((acc, [key, val]) => {
          if (keys.includes(key) || key.startsWith("#")) {
            acc[key] = val;
          }
          return acc;
        }, {} as Record<string, unknown>) as NostrFilter;
      });
  }

  /**
   * Bech32 string.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#bech32
   */
  static bech32<P extends string>(prefix?: P) {
    return z
      .string()
      .regex(/^[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}$/)
      .refine((value) =>
        prefix ? value.startsWith(`${prefix}1`) : true
      );
  }

  /** WebSocket URL starting with `ws://` or `wss://`. */
  static relayUrl() {
    return z
      .url()
      .regex(/^wss?:\/\//);
  }

  /** NIP-01 `EVENT` message from client to relay. */
  static clientEVENT() {
    return z.tuple([
      z.literal("EVENT"),
      NSchema.event(),
    ]);
  }

  /** NIP-01 `REQ` message from client to relay. */
  static clientREQ() {
    return z.tuple([z.literal("REQ"), z.string()]).rest(NSchema.filter());
  }

  /** NIP-45 `COUNT` message from client to relay. */
  static clientCOUNT() {
    return z.tuple([z.literal("COUNT"), z.string()]).rest(NSchema.filter());
  }

  /** NIP-01 `CLOSE` message from client to relay. */
  static clientCLOSE() {
    return z.tuple([z.literal("CLOSE"), z.string()]);
  }

  /** NIP-42 `AUTH` message from client to relay. */
  static clientAUTH() {
    return z.tuple([
      z.literal("AUTH"),
      NSchema.event(),
    ]);
  }

  /** NIP-01 message from client to relay. */
  static clientMsg() {
    return z.union([
      NSchema.clientEVENT(),
      NSchema.clientREQ(),
      NSchema.clientCOUNT(),
      NSchema.clientCLOSE(),
      NSchema.clientAUTH(),
    ]);
  }

  /** NIP-01 `EVENT` message from relay to client. */
  static relayEVENT() {
    return z.tuple([
      z.literal("EVENT"),
      z.string(),
      NSchema.event(),
    ]);
  }

  /** NIP-01 `OK` message from relay to client. */
  static relayOK() {
    return z.tuple([
      z.literal("OK"),
      NSchema.id(),
      z.boolean(),
      z.string(),
    ]);
  }

  /** NIP-01 `EOSE` message from relay to client. */
  static relayEOSE() {
    return z.tuple([z.literal("EOSE"), z.string()]);
  }

  /** NIP-01 `NOTICE` message from relay to client. */
  static relayNOTICE() {
    return z.tuple([z.literal("NOTICE"), z.string()]);
  }

  /** NIP-01 `CLOSED` message from relay to client. */
  static relayCLOSED() {
    return z.tuple([
      z.literal("CLOSED"),
      z.string(),
      z.string(),
    ]);
  }

  /** NIP-42 `AUTH` message from relay to client. */
  static relayAUTH() {
    return z.tuple([z.literal("AUTH"), z.string()]);
  }

  /** NIP-45 `COUNT` message from relay to client. */
  static relayCOUNT() {
    return z.tuple([
      z.literal("COUNT"),
      z.string(),
      z.object({
        count: z.number().int().nonnegative(),
        approximate: z.boolean().optional(),
      }),
    ]);
  }

  /** NIP-01 message from relay to client. */
  static relayMsg() {
    return z.union([
      NSchema.relayEVENT(),
      NSchema.relayOK(),
      NSchema.relayEOSE(),
      NSchema.relayNOTICE(),
      NSchema.relayCLOSED(),
      NSchema.relayAUTH(),
      NSchema.relayCOUNT(),
    ]);
  }

  /** Kind 0 content schema. */
  static metadata() {
    return z.looseObject({
      about: z.string().optional().catch(undefined),
      banner: z.url().optional().catch(undefined),
      bot: z.boolean().optional().catch(undefined),
      display_name: z.string().optional().catch(undefined),
      lud06: NSchema.bech32("lnurl").optional().catch(undefined),
      lud16: z.email().optional().catch(undefined),
      name: z.string().optional().catch(undefined),
      nip05: z.email().optional().catch(undefined),
      picture: z.url().optional().catch(undefined),
      website: z.url().optional().catch(undefined),
    });
  }

  /** NIP-46 request content schema. */
  static connectRequest() {
    return z.object({
      id: z.string(),
      method: z.string(),
      params: z.string().array(),
    });
  }

  /** NIP-46 response content schema. */
  static connectResponse() {
    return z.object({
      id: z.string(),
      result: z.string(),
      error: z.string().optional(),
    });
  }

  /**
   * Helper schema to parse a JSON string. It should then be piped into another schema. For example:
   *
   * ```ts
   * const event = NSchema.json().pipe(NSchema.event()).parse(data);
   * ```
   */
  static json() {
    return z.string().transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON" });
        return z.NEVER;
      }
    });
  }
}

export { NSchema, z };
