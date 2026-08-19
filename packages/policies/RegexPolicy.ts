import type { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * Reject events whose content matches the regex.
 *
 * ```ts
 * // Ban events matching a regex.
 * new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i);
 * ```
 */
export class RegexPolicy implements NPolicy {
  private regex: RegExp;

  constructor(regex: RegExp) {
    // `test` on a `g` or `y` regex advances `lastIndex` and resumes from there on
    // the next call, so a banned phrase would match, then miss, then match again
    // — letting every other copy of it through. Drop those flags; this is a
    // whole-string predicate, and where the match begins is of no interest.
    this.regex = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ''));
  }

  // deno-lint-ignore require-await
  async call({ id, content }: NostrEvent): Promise<NostrRelayOK> {
    if (this.regex.test(content)) {
      return ['OK', id, false, 'blocked: text matches a banned expression'];
    }

    return ['OK', id, true, ''];
  }
}
