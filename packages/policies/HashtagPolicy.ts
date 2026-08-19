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
  /** Banned hashtags, lowercased once so the comparison can't be defeated by case. */
  private hashtags: Set<string>;

  constructor(hashtags: Iterable<string>) {
    this.hashtags = new Set([...hashtags].map((hashtag) => hashtag.toLowerCase()));
  }

  // deno-lint-ignore require-await
  async call({ id, tags }: NostrEvent): Promise<NostrRelayOK> {
    for (const [name, value] of tags) {
      // A tag is an arbitrary array of strings, so a bare `["t"]` is well-formed
      // enough to reach here with no value at all.
      if (name !== 't' || typeof value !== 'string') continue;

      if (this.hashtags.has(value.toLowerCase())) {
        return ['OK', id, false, 'blocked: contains a banned hashtag'];
      }
    }

    return ['OK', id, true, ''];
  }
}
