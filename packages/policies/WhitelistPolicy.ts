import type { NostrEvent, NostrRelayInfo, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * Allows only the listed pubkeys to post. All other events are rejected.
 *
 * ```ts
 * // Only the given pubkey may post.
 * new WhitelistPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']);
 * ```
 */
export class WhitelistPolicy implements NPolicy {
  private pubkeys: Iterable<string>;

  constructor(pubkeys: Iterable<string>) {
    this.pubkeys = pubkeys;
  }

  // deno-lint-ignore require-await
  async call({ id, pubkey }: NostrEvent): Promise<NostrRelayOK> {
    for (const p of this.pubkeys) {
      if (p === pubkey) {
        return ['OK', id, true, ''];
      }
    }

    return ['OK', id, false, 'blocked: only certain pubkeys are allowed to post'];
  }

  get info(): NostrRelayInfo {
    return {
      limitation: {
        restricted_writes: true,
      },
    };
  }
}
