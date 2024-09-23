import { NostrEvent, NostrRelayInfo, NostrRelayOK, NPolicy } from '@nostrify/types';
import { nip13 } from 'nostr-tools';

/** Policy options for `PowPolicy`. */
interface PowPolicyOpts {
  /** Events will be rejected if their `id` does not contain at least this many leading 0 bits. Default: `1` */
  difficulty?: number;
}

/**
 * Reject events which don't meet Proof-of-Work ([NIP-13](https://github.com/nostr-protocol/nips/blob/master/13.md)) criteria.
 *
 * ```ts
 * new PowPolicy({ difficulty: 20 });
 * ```
 */
export class PowPolicy implements NPolicy {
  constructor(private opts: PowPolicyOpts = {}) {}

  // deno-lint-ignore require-await
  async call({ id, tags }: NostrEvent): Promise<NostrRelayOK> {
    const { difficulty = 1 } = this.opts;

    const pow = nip13.getPow(id);
    const nonce = tags.find(([name]) => name === 'nonce');

    if (pow >= difficulty && nonce && Number(nonce[2]) >= difficulty) {
      return ['OK', id, true, ''];
    }

    return ['OK', id, false, `pow: insufficient proof-of-work (difficulty ${difficulty})`];
  }

  get info(): NostrRelayInfo {
    return {
      limitation: {
        min_pow_difficulty: this.opts.difficulty,
      },
    };
  }
}
