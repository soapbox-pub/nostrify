import type { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/types';

/** Options for the `WoTPolicy`. */
interface WoTPolicyOpts {
  /** Store to get kind 3 follow lists from. */
  store: NStore;
  /** Initial set of trusted pubkeys to query follow lists for. */
  pubkeys: Iterable<string>;
  /**
   * How many levels of follow lists to query.
   * `0` will just whitelist the given `pubkeys` without checking their follow lists.
   * `1` will query their follows,
   * `2` will query their follows follows, etc.
   */
  depth: number;
  /**
   * Minimum number of people within the greater WoT who must follow a pubkey
   * for it to be included in the final trusted set.
   *
   * The "greater WoT" is the unfiltered set of all follows-of-follows up to
   * `depth`. Each candidate pubkey is then counted: how many members of the
   * greater WoT follow them? Only those who reach `quorum` are kept.
   *
   * The seed `pubkeys` are always trusted regardless of quorum.
   *
   * Defaults to `1`, which preserves the original behaviour (anyone reachable
   * via the follow graph is allowed).
   */
  quorum?: number;
}

/** Whitelist pubkeys the given user follows, people those users follow, etc. up to `depth`. */
export class WoTPolicy implements NPolicy {
  private pubkeys: Promise<Set<string>> | undefined;
  private opts: WoTPolicyOpts;

  constructor(opts: WoTPolicyOpts) {
    this.opts = opts;
  }

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    this.pubkeys ??= this.getPubkeys();
    const pubkeys = await this.pubkeys;

    if (pubkeys.has(event.pubkey)) {
      return ['OK', event.id, true, ''];
    }

    return ['OK', event.id, false, 'blocked: only certain pubkeys are allowed to post'];
  }

  /** Retrieve the complete set of pubkeys to whitelist. */
  private async getPubkeys(): Promise<Set<string>> {
    const { store, depth } = this.opts;
    const quorum = this.opts.quorum ?? 1;

    const seedPubkeys = new Set<string>([...this.opts.pubkeys]);

    // Build the greater WoT: all pubkeys reachable within `depth` hops.
    // Also track, for each discovered pubkey, how many members of the greater
    // WoT follow them (follower count within the graph).
    const greaterWoT = new Set<string>(seedPubkeys);
    const followerCount = new Map<string, number>();
    const authors = new Set(seedPubkeys);

    for (let i = 0; i < depth; i++) {
      const events = await store.query([{ kinds: [3], authors: [...authors] }]);

      authors.clear();

      for (const event of events) {
        for (const [name, value] of event.tags) {
          if (name === 'p') {
            followerCount.set(value, (followerCount.get(value) ?? 0) + 1);

            if (!greaterWoT.has(value)) {
              authors.add(value);
              greaterWoT.add(value);
            }
          }
        }
      }
    }

    if (quorum <= 1) {
      return greaterWoT;
    }

    // Keep only pubkeys that meet the quorum threshold.
    const trusted = new Set<string>(seedPubkeys);

    for (const pubkey of greaterWoT.difference(seedPubkeys)) {
      if ((followerCount.get(pubkey) ?? 0) < quorum) {
          continue;
      }

      trusted.add(pubkey);
    }

    return trusted;
  }
}
