import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * Reject events containing any of the strings in its content.
 *
 * @example
 * ```ts
 * // Reject events with bad words.
 * KeywordPolicy(['moo', 'oink', 'honk']);
 * ```
 */
export class KeywordPolicy implements NPolicy {
  constructor(private words: Iterable<string>) {}

  // deno-lint-ignore require-await
  async call({ id, content }: NostrEvent): Promise<NostrRelayOK> {
    for (const word of this.words) {
      if (content.toLowerCase().includes(word.toLowerCase())) {
        return ['OK', id, false, 'blocked: contains a banned word or phrase'];
      }
    }

    return ['OK', id, true, ''];
  }
}
