import { NostrJson } from '../interfaces/NostrJson.ts';
import { NProfilePointer } from '../interfaces/NProfilePointer.ts';

import { n, z } from './schema.ts';

interface LookupOpts {
  fetch?: typeof fetch;
  signal?: AbortSignal | null;
}

export class NIP05 {
  /** NIP-05 value regex. */
  static regex() {
    return /^(?:([\w.+-]+)@)?([\w.-]+)$/;
  }

  /** `nostr.json` response schema. */
  static nostrJsonSchema(): z.ZodType<NostrJson> {
    return z.object({
      names: z.record(z.string().regex(/^[\w.+-]+$/), n.id()),
      relays: z.record(n.id(), z.array(z.string().url())).optional(),
    });
  }

  /** Resolve NIP-05 name to a profile pointer. */
  static async lookup(nip05: string, opts?: LookupOpts): Promise<NProfilePointer> {
    const { fetch = globalThis.fetch, signal } = opts ?? {};

    const match = nip05.match(NIP05.regex());
    if (!match) throw new Error(`NIP-05: invalid name ${nip05}`);

    const [_, name = '_', domain] = match;

    const url = new URL(`/.well-known/nostr.json?name=${encodeURIComponent(name)}`, `https://${domain}/`);
    const res = await fetch(url, { signal });

    const { names, relays } = NIP05.nostrJsonSchema().parse(await res.json());
    const pubkey = names[name] as string | undefined;

    if (!pubkey) throw new Error(`NIP-05: no match for ${nip05}`);

    return {
      pubkey,
      relays: relays?.[pubkey] ?? [],
    };
  }
}
