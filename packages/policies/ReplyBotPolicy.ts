import { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/types';

/** Options for the ReplyBotPolicy. */
export interface ReplyBotPolicyOpts {
  /** The store to use for fetching events. */
  store: NStore;
  /** The minimum time in seconds between two posts. */
  threshold?: number;
  /** The kinds of events to apply the policy to. */
  kinds?: number[];
}

/** Block events that reply too quickly to another event. */
export class ReplyBotPolicy implements NPolicy {
  constructor(private opts: ReplyBotPolicyOpts) {}

  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    const { store, threshold = 1, kinds = [1] } = this.opts;

    if (kinds.includes(event.kind)) {
      const [, replyToId] = ReplyBotPolicy.findReplyTag(event.tags) ?? [];

      if (replyToId) {
        const [prevEvent] = await store.query([{ ids: [replyToId] }], { signal });

        if (prevEvent) {
          const diff = event.created_at - prevEvent.created_at;
          const pTag = prevEvent.tags.find(([name, value]) => name === 'p' && value === event.pubkey);

          if (diff <= threshold && !pTag) {
            return ['OK', event.id, false, 'rate-limited: replied too quickly'];
          }
        }
      }
    }

    return ['OK', event.id, true, ''];
  }

  /** Tag is a NIP-10 root tag. */
  private static isRootTag(tag: string[]): tag is ['e', string, string, 'root', ...string[]] {
    return tag[0] === 'e' && tag[3] === 'root';
  }

  /** Tag is a NIP-10 reply tag. */
  private static isReplyTag(tag: string[]): tag is ['e', string, string, 'reply', ...string[]] {
    return tag[0] === 'e' && tag[3] === 'reply';
  }

  /** Tag is an "e" tag without a NIP-10 marker. */
  private static isLegacyReplyTag(tag: string[]): tag is ['e', string, string] {
    return tag[0] === 'e' && !tag[3];
  }

  /** Get the "e" tag for the event being replied to, first according to the NIPs then falling back to the legacy way. */
  private static findReplyTag(tags: string[][]): ['e', ...string[]] | undefined {
    return tags.find(this.isReplyTag) || tags.find(this.isRootTag) || tags.findLast(this.isLegacyReplyTag);
  }
}
