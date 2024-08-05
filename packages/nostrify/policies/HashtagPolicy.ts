import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/**
 * Reject events containing any of the banned hashtags.
 *
 * @example
 * ```ts
 * // Reject events with banned hashtags.
 * HashtagPolicy(['nsfw']);
 * ```
 */
export class HashtagPolicy implements NPolicy {
  constructor(private hashtags: string[]) {}

  // deno-lint-ignore require-await
  async call({ id, tags }: NostrEvent): Promise<NostrRelayOK> {
    for (const [name, value] of tags) {
      if (name === 't' && this.hashtags.includes(value.toLowerCase())) {
        return ['OK', id, false, 'blocked: contains a banned hashtag'];
      }
    }

    return ['OK', id, true, ''];
  }
}
