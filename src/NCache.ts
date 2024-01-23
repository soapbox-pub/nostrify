// deno-lint-ignore-file require-await

import { LRUCache } from 'npm:lru-cache@^10.1.0';
import { matchFilters } from 'npm:nostr-tools@^2.1.4';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NStore } from '../interfaces/NStore.ts';

import { NSet } from './NSet.ts';

/** Nost event LRU cache based on [`npm:lru-cache`](https://www.npmjs.com/package/lru-cache). */
class NCache extends NSet implements NStore {
  constructor(...args: ConstructorParameters<typeof LRUCache<string, NostrEvent>>) {
    super(new LRUCache<string, NostrEvent>(...args) as Map<string, NostrEvent>);
  }

  async event(event: NostrEvent): Promise<void> {
    this.add(event);
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for (const event of this) {
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

  async count(filters: NostrFilter[]): Promise<number> {
    return (await this.query(filters)).length;
  }
}

export { NCache };
