// deno-lint-ignore-file require-await

import { LRUCache } from 'npm:lru-cache@^10.1.0';
import { matchFilters } from 'npm:nostr-tools@^2.1.4';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NStore } from '../interfaces/NStore.ts';

import { NSet } from './NSet.ts';

/** Nost event LRU cache based on [`npm:lru-cache`](https://www.npmjs.com/package/lru-cache). */
class NCache<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> extends NSet<T>
  implements NStore<T, F> {
  constructor(...args: ConstructorParameters<typeof LRUCache<string, T>>) {
    super(new LRUCache<string, T>(...args) as Map<string, T>);
  }

  async event(event: T): Promise<void> {
    this.add(event);
  }

  async query(filters: F[]): Promise<T[]> {
    const events: T[] = [];

    for (const event of this) {
      if (matchFilters(filters, event)) {
        this.cache.get(event.id);
        events.push(event);
      }
    }

    return events;
  }

  async remove(filters: F[]): Promise<void> {
    for (const event of this) {
      if (matchFilters(filters, event)) {
        this.delete(event);
      }
    }
  }

  async count(filters: F[]): Promise<number> {
    return (await this.query(filters)).length;
  }
}

export { NCache };
