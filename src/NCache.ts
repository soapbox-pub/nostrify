// deno-lint-ignore-file require-await

import { LRUCache } from 'lru-cache';
import { matchFilters } from 'nostr-tools';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NostrRelayCOUNT } from '../interfaces/NostrRelayMsg.ts';
import { NStore } from '../interfaces/NStore.ts';

import { NSet } from './NSet.ts';

/**
 * Nostr LRU cache based on [`npm:lru-cache`](https://www.npmjs.com/package/lru-cache).
 * It implements both `NStore` and `NSet` interfaces.
 *
 * ```ts
 * // Accepts the options of `npm:lru-cache`:
 * const cache = new NCache({ max: 1000 });
 *
 * // Events can be added like a regular `Set`:
 * cache.add(event1);
 * cache.add(event2);
 *
 * // Can be queried like `NStore`:
 * const events = await cache.query([{ kinds: [1] }]);
 *
 * // Can be iterated like `NSet`:
 * for (const event of cache) {
 *  console.log(event);
 * }
 * ```
 */
class NCache extends NSet implements NStore {
  constructor(...args: ConstructorParameters<typeof LRUCache<string, NostrEvent>>) {
    super(new LRUCache<string, NostrEvent>(...args));
  }

  async event(event: NostrEvent): Promise<void> {
    this.add(event);
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for (const event of [...this]) {
      if (matchFilters(filters, event)) {
        this.cache.get(event.id);
        events.push(event);
      }
    }

    return events;
  }

  async remove(filters: NostrFilter[]): Promise<void> {
    for (const event of this) {
      if (matchFilters(filters, event)) {
        this.delete(event);
      }
    }
  }

  async count(filters: NostrFilter[]): Promise<NostrRelayCOUNT[2]> {
    const events = await this.query(filters);
    return {
      count: events.length,
      approximate: false,
    };
  }

  [Symbol.toStringTag] = 'NCache';
}

export { NCache };
