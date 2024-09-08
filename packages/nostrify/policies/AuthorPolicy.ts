import { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/types';

/** Rejects events by authors without a kind 0, then optionally applies another policy to the kind 0. */
export class AuthorPolicy implements NPolicy {
  constructor(private store: NStore, private policy?: NPolicy) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const [author] = await this.store.query([{ kinds: [0], authors: [event.pubkey], limit: 1 }]);

    if (!author) {
      return ['OK', event.id, false, 'blocked: author is missing a kind 0 event'];
    }

    if (this.policy) {
      const [, , ok, reason] = await this.policy.call(author);
      return ['OK', event.id, ok, reason];
    }

    return ['OK', event.id, true, ''];
  }
}
