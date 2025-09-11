import { z } from "zod";

import type {
  NostrClientAUTH,
  NostrClientCLOSE,
  NostrClientCOUNT,
  NostrClientEVENT,
  NostrClientMsg,
  NostrClientREQ,
  NostrConnectRequest,
  NostrConnectResponse,
  NostrEvent,
  NostrFilter,
  NostrMetadata,
  NostrRelayAUTH,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NostrRelayMsg,
  NostrRelayNOTICE,
  NostrRelayOK,
} from "@nostrify/types";

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
  static id(): z.ZodString {
    return z.string().regex(/^[0-9a-f]{64}$/);
  }

  /** Nostr event schema. */
  static event(): z.ZodType<NostrEvent> {
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
    }) as z.ZodType<NostrEvent>;
  }

  /** Nostr filter schema. */
  static filter(): z.ZodType<NostrFilter> {
    return z.object({
      kinds: z.number().int().nonnegative().array().optional(),
      ids: NSchema.id().array().optional(),
      authors: NSchema.id().array().optional(),
      since: z.number().int().nonnegative().optional(),
      until: z.number().int().nonnegative().optional(),
      limit: z.number().int().nonnegative().optional(),
      search: z.string().optional(),
    })
      .passthrough()
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
      }) as z.ZodType<NostrFilter>;
  }

  /**
   * Bech32 string.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#bech32
   */
  static bech32<P extends string>(prefix?: P): z.ZodType<`${P}1${string}`> {
    return z
      .string()
      .regex(/^[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}$/)
      .refine((value) =>
        prefix ? value.startsWith(`${prefix}1`) : true
      ) as z.ZodType<`${P}1${string}`>;
  }

  /** WebSocket URL starting with `ws://` or `wss://`. */
  static relayUrl(): z.ZodType<`ws://${string}` | `wss://${string}`> {
    return z
      .string()
      .url()
      .regex(/^wss?:\/\//) as z.ZodType<`ws://${string}` | `wss://${string}`>;
  }

  /** NIP-01 `EVENT` message from client to relay. */
  static clientEVENT(): z.ZodType<NostrClientEVENT> {
    return z.tuple([
      z.literal("EVENT"),
      NSchema.event(),
    ]) as unknown as z.ZodType<
      NostrClientEVENT
    >;
  }

  /** NIP-01 `REQ` message from client to relay. */
  static clientREQ(): z.ZodType<NostrClientREQ> {
    return z.tuple([z.literal("REQ"), z.string()]).rest(NSchema.filter());
  }

  /** NIP-45 `COUNT` message from client to relay. */
  static clientCOUNT(): z.ZodType<NostrClientCOUNT> {
    return z.tuple([z.literal("COUNT"), z.string()]).rest(NSchema.filter());
  }

  /** NIP-01 `CLOSE` message from client to relay. */
  static clientCLOSE(): z.ZodType<NostrClientCLOSE> {
    return z.tuple([z.literal("CLOSE"), z.string()]) as unknown as z.ZodType<
      NostrClientCLOSE
    >;
  }

  /** NIP-42 `AUTH` message from client to relay. */
  static clientAUTH(): z.ZodType<NostrClientAUTH> {
    return z.tuple([
      z.literal("AUTH"),
      NSchema.event(),
    ]) as unknown as z.ZodType<
      NostrClientAUTH
    >;
  }

  /** NIP-01 message from client to relay. */
  static clientMsg(): z.ZodType<NostrClientMsg> {
    return z.union([
      NSchema.clientEVENT(),
      NSchema.clientREQ(),
      NSchema.clientCOUNT(),
      NSchema.clientCLOSE(),
      NSchema.clientAUTH(),
    ]) as z.ZodType<NostrClientMsg>;
  }

  /** NIP-01 `EVENT` message from relay to client. */
  static relayEVENT(): z.ZodType<NostrRelayEVENT> {
    return z.tuple([
      z.literal("EVENT"),
      z.string(),
      NSchema.event(),
    ]) as unknown as z.ZodType<NostrRelayEVENT>;
  }

  /** NIP-01 `OK` message from relay to client. */
  static relayOK(): z.ZodType<NostrRelayOK> {
    return z.tuple([
      z.literal("OK"),
      NSchema.id(),
      z.boolean(),
      z.string(),
    ]) as unknown as z.ZodType<NostrRelayOK>;
  }

  /** NIP-01 `EOSE` message from relay to client. */
  static relayEOSE(): z.ZodType<NostrRelayEOSE> {
    return z.tuple([z.literal("EOSE"), z.string()]) as unknown as z.ZodType<
      NostrRelayEOSE
    >;
  }

  /** NIP-01 `NOTICE` message from relay to client. */
  static relayNOTICE(): z.ZodType<NostrRelayNOTICE> {
    return z.tuple([z.literal("NOTICE"), z.string()]) as unknown as z.ZodType<
      NostrRelayNOTICE
    >;
  }

  /** NIP-01 `CLOSED` message from relay to client. */
  static relayCLOSED(): z.ZodType<NostrRelayCLOSED> {
    return z.tuple([
      z.literal("CLOSED"),
      z.string(),
      z.string(),
    ]) as unknown as z.ZodType<NostrRelayCLOSED>;
  }

  /** NIP-42 `AUTH` message from relay to client. */
  static relayAUTH(): z.ZodType<NostrRelayAUTH> {
    return z.tuple([z.literal("AUTH"), z.string()]) as unknown as z.ZodType<
      NostrRelayAUTH
    >;
  }

  /** NIP-45 `COUNT` message from relay to client. */
  static relayCOUNT(): z.ZodType<NostrRelayCOUNT> {
    return z.tuple([
      z.literal("COUNT"),
      z.string(),
      z.object({
        count: z.number().int().nonnegative(),
        approximate: z.boolean().optional(),
      }),
    ]) as unknown as z.ZodType<NostrRelayCOUNT>;
  }

  /** NIP-01 message from relay to client. */
  static relayMsg(): z.ZodType<NostrRelayMsg> {
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
  static metadata(): z.ZodType<NostrMetadata> {
    return z.object({
      about: z.string().optional().catch(undefined),
      banner: z.string().url().optional().catch(undefined),
      bot: z.boolean().optional().catch(undefined),
      display_name: z.string().optional().catch(undefined),
      lud06: NSchema.bech32("lnurl").optional().catch(undefined),
      lud16: z.string().email().optional().catch(undefined),
      name: z.string().optional().catch(undefined),
      nip05: z.string().email().optional().catch(undefined),
      picture: z.string().url().optional().catch(undefined),
      website: z.string().url().optional().catch(undefined),
    }).passthrough() as z.ZodType<NostrMetadata>;
  }

  /** NIP-46 request content schema. */
  static connectRequest(): z.ZodType<NostrConnectRequest> {
    return z.object({
      id: z.string(),
      method: z.string(),
      params: z.string().array(),
    }) as z.ZodType<NostrConnectRequest>;
  }

  /** NIP-46 response content schema. */
  static connectResponse(): z.ZodType<NostrConnectResponse> {
    return z.object({
      id: z.string(),
      result: z.string(),
      error: z.string().optional(),
    }) as z.ZodType<NostrConnectResponse>;
  }

  /**
   * Helper schema to parse a JSON string. It should then be piped into another schema. For example:
   *
   * ```ts
   * const event = NSchema.json().pipe(NSchema.event()).parse(data);
   * ```
   */
  static json(): z.ZodType<unknown> {
    return z.string().transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch (_e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON" });
        return z.NEVER;
      }
    });
  }
}

export { NSchema, z };
