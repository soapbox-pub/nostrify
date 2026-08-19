import type { NProfilePointer } from "@nostrify/types";

import { NSchema as n, z } from "./NSchema.ts";
import { readCapped } from "./utils/readCapped.ts";

interface LookupOpts {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /**
   * Milliseconds to wait for the response. Default: `10_000`.
   * Ignored when `signal` is given, which then governs the deadline.
   */
  timeout?: number;
  /**
   * Largest response body, in bytes, that will be read. Default: `1_048_576`.
   *
   * A `?name=` query is answered with one entry, and even a provider that
   * serves its whole `nostr.json` is nowhere near this. The cap exists because
   * the host is named by the identifier being looked up: resolving one supplied
   * by a user points this at a server of their choosing, which is then free to
   * answer with a body that never ends.
   */
  maxSize?: number;
}

export class NIP05 {
  /** NIP-05 value regex. */
  static regex(): RegExp {
    return /^(?:([\w.+-]+)@)?((?:[\w-]+\.)+[\w-]+)$/;
  }

  /** Nostr pubkey with relays object. Built once, since `NSchema` constructs a new schema tree on every call. */
  private static readonly profilePointerSchema = z.object({
    pubkey: n.id(),
    relays: n.relayUrl().array().optional(),
  }) as z.ZodType<NProfilePointer>;

  /** Resolve NIP-05 name to a profile pointer. */
  static async lookup(
    nip05: string,
    opts?: LookupOpts,
  ): Promise<NProfilePointer> {
    const {
      fetch = globalThis.fetch.bind(globalThis),
      timeout = 10_000,
      maxSize = 1_048_576,
      signal = AbortSignal.timeout(timeout),
    } = opts ?? {};

    const match = nip05.match(NIP05.regex());
    if (!match) throw new Error(`NIP-05: invalid name ${nip05}`);

    const [_, name = "_", domain] = match;

    const url = new URL("/.well-known/nostr.json", `https://${domain}/`);
    url.searchParams.set("name", name);

    const response = await fetch(url, { signal });

    // An error page is not an answer. Without this its body gets parsed anyway,
    // so a 404 serving HTML fails as a JSON syntax error further down instead
    // of saying what happened.
    if (!response.ok) {
      throw new Error(`NIP-05: ${domain} responded ${response.status}`);
    }

    const body = response.body
      ? await readCapped(response.body, maxSize, `NIP-05: ${domain} sent too much data`)
      : new Uint8Array();

    const json = JSON.parse(new TextDecoder().decode(body));

    try {
      const pubkey = json.names[name];
      const relays = json.relays?.[pubkey];

      return NIP05.profilePointerSchema.parse({ pubkey, relays });
    } catch {
      throw new Error(`NIP-05: no match for ${nip05}`);
    }
  }
}
