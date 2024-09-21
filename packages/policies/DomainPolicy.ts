import { NIP05, NSchema as n } from '@nostrify/nostrify';
import { NostrEvent, NostrRelayOK, NPolicy, NProfilePointer, NStore } from '@nostrify/types';

import { AuthorPolicy } from './AuthorPolicy.ts';

interface DomainPolicyOpts {
  store: NStore;
  lookup?(nip05: string, signal?: AbortSignal): Promise<NProfilePointer>;
  blacklist?: string[];
  whitelist?: string[];
  exempt?: string[];
}

/**
 * Ban events unless their author has a valid NIP-05 name.
 * Domains can be whitelisted/blacklisted, and specific pubkeys can be exempt.
 */
export class DomainPolicy extends AuthorPolicy implements NPolicy {
  constructor(private opts: DomainPolicyOpts) {
    super(opts.store, {
      async call(event, signal) {
        const { blacklist = [], whitelist, lookup = DomainPolicy.lookup } = opts;

        const metadata = n.json().pipe(n.metadata()).safeParse(event.content);

        if (!metadata.success) {
          return ['OK', event.id, false, 'blocked: invalid kind 0 metadata'];
        }

        const { nip05 } = metadata.data;

        if (!nip05) {
          return ['OK', event.id, false, 'blocked: missing nip05'];
        }

        const domain = nip05.split('@').pop();

        if (!domain) {
          return ['OK', event.id, false, 'blocked: invalid nip05'];
        }

        if (blacklist.includes(domain)) {
          return ['OK', event.id, false, 'blocked: blacklisted nip05 domain'];
        }

        try {
          const { pubkey } = await lookup(nip05, signal);

          if (pubkey !== event.pubkey) {
            return ['OK', event.id, false, 'blocked: mismatched nip05 pubkey'];
          }

          if (whitelist && !whitelist.includes(domain)) {
            return ['OK', event.id, false, 'blocked: nip05 domain not in whitelist'];
          }

          return ['OK', event.id, true, ''];
        } catch {
          return ['OK', event.id, false, 'blocked: failed to lookup nip05'];
        }
      },
    });
  }

  // deno-lint-ignore require-await
  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    const { exempt = [] } = this.opts;

    if (exempt.includes(event.pubkey)) {
      return ['OK', event.id, true, ''];
    }

    return super.call(event, signal);
  }

  private static lookup(nip05: string, signal?: AbortSignal): Promise<NProfilePointer> {
    return NIP05.lookup(nip05, { signal });
  }
}
