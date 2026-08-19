import { NIP05, NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NPolicy, NProfilePointer, NStore } from '@nostrify/types';

import { AuthorPolicy } from './AuthorPolicy.ts';

/** Parser for kind 0 content. Built once, since `NSchema` constructs a new schema tree on every call. */
const metadataSchema = n.json().pipe(n.metadata());

/** Options for `DomainPolicy`. */
interface DomainPolicyOpts {
  /** Custom NIP-05 lookup function. */
  lookup?(nip05: string, signal?: AbortSignal): Promise<NProfilePointer>;
  /** List of domains to blacklist. Reject events from users with a NIP-05 matching any of these domains. */
  blacklist?: string[];
  /** List of domains to whitelist. If provided, only events from users with a valid NIP-05 on the given domains will be accepted. */
  whitelist?: string[];
}

/** Ban events unless their author has a valid NIP-05 name. Domains can also be whitelisted or blacklisted. */
export class DomainPolicy extends AuthorPolicy implements NPolicy {
  constructor(store: NStore, opts: DomainPolicyOpts = {}) {
    super(store, {
      async call(event: NostrEvent, signal: AbortSignal) {
        const { blacklist = [], whitelist, lookup = DomainPolicy.lookup } = opts;

        const metadata = metadataSchema.safeParse(event.content);

        if (!metadata.success) {
          return ['OK', event.id, false, 'blocked: invalid kind 0 metadata'];
        }

        const { nip05 } = metadata.data;

        if (!nip05) {
          return ['OK', event.id, false, 'blocked: missing nip05'];
        }

        const domain = DomainPolicy.normalizeDomain(nip05.split('@').pop());

        if (!domain) {
          return ['OK', event.id, false, 'blocked: invalid nip05'];
        }

        if (DomainPolicy.isDomainBlacklisted(domain, blacklist)) {
          return ['OK', event.id, false, 'blocked: blacklisted nip05 domain'];
        }

        // Both list checks run before `lookup`, so a rejected domain never costs
        // a request. Otherwise any pubkey could steer the relay's HTTP client at
        // a host of its choosing just by publishing a kind 0.
        if (whitelist && !whitelist.map(DomainPolicy.normalizeDomain).includes(domain)) {
          return [
            'OK',
            event.id,
            false,
            'blocked: nip05 domain not in whitelist',
          ];
        }

        try {
          const { pubkey } = await lookup(nip05, signal);

          if (pubkey !== event.pubkey) {
            return ['OK', event.id, false, 'blocked: mismatched nip05 pubkey'];
          }

          return ['OK', event.id, true, ''];
        } catch {
          return ['OK', event.id, false, 'blocked: failed to lookup nip05'];
        }
      },
    });
  }

  /**
   * Fold a domain to the form the lists are compared against.
   *
   * DNS is case-insensitive and a trailing dot denotes the same (fully
   * qualified) name, so `EVIL.COM` and `evil.com.` both resolve exactly where
   * `evil.com` does. Compared verbatim they would slip past a blacklist while
   * still passing the NIP-05 lookup, since `URL` folds the host itself.
   */
  private static normalizeDomain(domain: string | undefined): string {
    return (domain ?? '').toLowerCase().replace(/\.$/, '');
  }

  /** Check if a domain is blacklisted, including subdomains of blacklisted domains. */
  private static isDomainBlacklisted(
    domain: string,
    blacklist: string[],
  ): boolean {
    for (const entry of blacklist) {
      const blacklistedDomain = DomainPolicy.normalizeDomain(entry);

      if (!blacklistedDomain) continue;

      // Exact match, or a subdomain of a blacklisted domain.
      if (domain === blacklistedDomain || domain.endsWith('.' + blacklistedDomain)) {
        return true;
      }
    }

    return false;
  }

  /** Default NIP-05 lookup method if one isn't provided by the caller. */
  private static lookup(
    nip05: string,
    signal?: AbortSignal,
  ): Promise<NProfilePointer> {
    return NIP05.lookup(nip05, { signal });
  }
}
