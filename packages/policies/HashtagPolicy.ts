import type { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

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
  private hashtags: string[];
  constructor(hashtags: string[]) {
    this.hashtags = hashtags;
  }

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
