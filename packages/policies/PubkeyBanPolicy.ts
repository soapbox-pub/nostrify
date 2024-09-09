import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * Ban events from individual pubkeys.
 *
 * ```ts
 * // Ban a specific pubkey.
 * new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']);
 * ```
 */
export class PubkeyBanPolicy implements NPolicy {
  constructor(private pubkeys: Iterable<string>) {}

  // deno-lint-ignore require-await
  async call({ id, pubkey }: NostrEvent): Promise<NostrRelayOK> {
    for (const p of this.pubkeys) {
      if (p === pubkey) {
        return ['OK', id, false, 'blocked: pubkey is banned'];
      }
    }

    return ['OK', id, true, ''];
  }
}
