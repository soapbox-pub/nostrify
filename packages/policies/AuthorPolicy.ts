import type { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/types';

/** Rejects events by authors without a kind 0, then optionally applies another policy to the kind 0. */
export class AuthorPolicy implements NPolicy {
  private store: NStore;
  private policy?: NPolicy;

  constructor(store: NStore, policy?: NPolicy) {
    this.store = store;
    this.policy = policy;
  }

  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    const author: NostrEvent | undefined = event.kind === 0 ? event : await this.store
      .query([{ kinds: [0], authors: [event.pubkey], limit: 1 }], { signal })
      .then(([event]: NostrEvent[]) => event);

    if (!author) {
      return ['OK', event.id, false, 'blocked: author is missing a kind 0 event'];
    }

    if (this.policy) {
      const [, , ok, reason] = await this.policy.call(author, signal);
      return ['OK', event.id, ok, reason];
    }

    return ['OK', event.id, true, ''];
  }
}
