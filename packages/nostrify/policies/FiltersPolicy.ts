import { matchFilters } from 'nostr-tools';

import { NostrEvent, NostrFilter, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * Reject events which don't match the filters.
 *
 * Only messages which **match** the filters are allowed, and all others are dropped.
 * The filter is a [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) relay filter.
 *
 * ```ts
 * // Only allow kind 1, 3, 5, and 7 events.
 * new FiltersPolicy([{ kinds: [0, 1, 3, 5, 6, 7] }]);
 * ```
 */
export class FiltersPolicy implements NPolicy {
  constructor(private filters: NostrFilter[]) {}

  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    if (matchFilters(this.filters, event)) {
      return ['OK', event.id, true, ''];
    }

    return ['OK', event.id, false, "blocked: the event doesn't match the allowed filters"];
  }
}
