import { NIP05, NSchema as n } from '@nostrify/nostrify';
import { NPolicy, NProfilePointer, NStore } from '@nostrify/types';

import { AuthorPolicy } from './AuthorPolicy.ts';

/** Options for `DomainPolicy`. */
interface DomainPolicyOpts {
  /** Store to look up the author's kind 0 event. */
  store: NStore;
  /** Custom NIP-05 lookup function. */
  lookup?(nip05: string, signal?: AbortSignal): Promise<NProfilePointer>;
  /** List of domains to blacklist. Reject events from users with a NIP-05 matching any of these domains. */
  blacklist?: string[];
  /** List of domains to whitelist. If provided, only events from users with a valid NIP-05 on the given domains will be accepted. */
  whitelist?: string[];
}

/** Ban events unless their author has a valid NIP-05 name. Domains can also be whitelisted or blacklisted. */
export class DomainPolicy extends AuthorPolicy implements NPolicy {
  constructor(opts: DomainPolicyOpts) {
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

  /** Default NIP-05 lookup method if one isn't provided by the caller. */
  private static lookup(nip05: string, signal?: AbortSignal): Promise<NProfilePointer> {
    return NIP05.lookup(nip05, { signal });
  }
}
