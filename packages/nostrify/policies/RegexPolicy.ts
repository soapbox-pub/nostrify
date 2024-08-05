import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/**
 * Reject events whose content matches the regex.
 *
 * ```ts
 * // Ban events matching a regex.
 * new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i);
 * ```
 */
export class RegexPolicy implements NPolicy {
  constructor(private regex: RegExp) {}

  // deno-lint-ignore require-await
  async call({ id, content }: NostrEvent): Promise<NostrRelayOK> {
    if (this.regex.test(content)) {
      return ['OK', id, false, 'blocked: text matches a banned expression'];
    }

    return ['OK', id, true, ''];
  }
}
