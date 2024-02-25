import { z } from 'npm:zod@^3.22.4';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrMetadata } from '../interfaces/NostrMetadata.ts';
import {
  NostrRelayAUTH,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NostrRelayMsg,
  NostrRelayNOTICE,
  NostrRelayOK,
} from '../interfaces/NostrRelayMsg.ts';

/**
 * A suite of [zod](https://github.com/colinhacks/zod) schemas for Nostr.
 *
 * ```ts
 * import { NSchema as n } from 'nspec';
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
      created_at: z.number(),
      sig: z.string(),
    });
  }

  /**
   * Bech32 string.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#bech32
   */
  static bech32<P extends string>(prefix?: P): z.ZodType<`${P}1${string}`> {
    return z
      .string()
      .regex(/^[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}$/)
      .refine((value) => prefix ? value.startsWith(`${prefix}1`) : true) as z.ZodType<`${P}1${string}`>;
  }

  /** NIP-01 `EVENT` message from relay to client. */
  static relayEVENT(): z.ZodType<NostrRelayEVENT> {
    return z.tuple([z.literal('EVENT'), z.string(), NSchema.event()]);
  }

  /** NIP-01 `OK` message from relay to client. */
  static relayOK(): z.ZodType<NostrRelayOK> {
    return z.tuple([z.literal('OK'), NSchema.id(), z.boolean(), z.string()]);
  }

  /** NIP-01 `EOSE` message from relay to client. */
  static relayEOSE(): z.ZodType<NostrRelayEOSE> {
    return z.tuple([z.literal('EOSE'), z.string()]);
  }

  /** NIP-01 `NOTICE` message from relay to client. */
  static relayNOTICE(): z.ZodType<NostrRelayNOTICE> {
    return z.tuple([z.literal('NOTICE'), z.string()]);
  }

  /** NIP-01 `CLOSED` message from relay to client. */
  static relayCLOSED(): z.ZodType<NostrRelayCLOSED> {
    return z.tuple([z.literal('CLOSED'), z.string(), z.string()]);
  }

  /** NIP-42 `AUTH` message from relay to client. */
  static relayAUTH(): z.ZodType<NostrRelayAUTH> {
    return z.tuple([z.literal('AUTH'), z.string()]);
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
    ]);
  }

  /** Kind 0 content schema. */
  static metadata(): z.ZodType<NostrMetadata> {
    return z.object({
      name: z.string().optional().catch(undefined),
      about: z.string().optional().catch(undefined),
      picture: z.string().optional().catch(undefined),
      banner: z.string().optional().catch(undefined),
      nip05: z.string().optional().catch(undefined),
      lud06: z.string().optional().catch(undefined),
      lud16: z.string().optional().catch(undefined),
    }).passthrough() as z.ZodType<NostrMetadata>;
  }

  /**
   * Helper schema to parse a JSON string. It should then be piped into another schema. For example:
   *
   * ```ts
   * const event = NSchema.jsonSchema().pipe(NSchema.event()).parse(data);
   * ```
   */
  static json(): z.ZodType<unknown> {
    return z.string().transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch (_e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
        return z.NEVER;
      }
    });
  }
}

export { NSchema, z };
