import type { NProfilePointer } from "@nostrify/types";

import { NSchema as n, z } from "./NSchema.ts";

interface LookupOpts {
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export class NIP05 {
  /** NIP-05 value regex. */
  static regex(): RegExp {
    return /^(?:([\w.+-]+)@)?([\w.-]+)$/;
  }

  /** Nostr pubkey with relays object. */
  private static profilePointerSchema(): z.ZodType<NProfilePointer> {
    return z.object({
      pubkey: n.id(),
      relays: n.relayUrl().array().optional(),
    }) as z.ZodType<NProfilePointer>;
  }

  /** Resolve NIP-05 name to a profile pointer. */
  static async lookup(
    nip05: string,
    opts?: LookupOpts,
  ): Promise<NProfilePointer> {
    const { fetch = globalThis.fetch.bind(globalThis), signal } = opts ?? {};

    const match = nip05.match(NIP05.regex());
    if (!match) throw new Error(`NIP-05: invalid name ${nip05}`);

    const [_, name = "_", domain] = match;

    const url = new URL("/.well-known/nostr.json", `https://${domain}/`);
    url.searchParams.set("name", name);

    const response = await fetch(url, { signal });
    const json = await response.json();

    try {
      const pubkey = json.names[name];
      const relays = json.relays?.[pubkey];

      return NIP05.profilePointerSchema().parse({ pubkey, relays });
    } catch {
      throw new Error(`NIP-05: no match for ${nip05}`);
    }
  }
}
