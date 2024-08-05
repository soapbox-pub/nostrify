import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/**
 * Allows only the listed pubkeys to post. All other events are rejected.
 *
 * ```ts
 * // Only the given pubkey may post.
 * new WhitelistPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']);
 * ```
 */
export class WhitelistPolicy implements NPolicy {
  constructor(private pubkeys: Iterable<string>) {}

  // deno-lint-ignore require-await
  async call({ id, pubkey }: NostrEvent): Promise<NostrRelayOK> {
    for (const p of this.pubkeys) {
      if (p === pubkey) {
        return ['OK', id, true, ''];
      }
    }

    return ['OK', id, false, 'blocked: only certain pubkeys are allowed to post'];
  }
}
