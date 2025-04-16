# Memory Storage

Nostrify ships with a few in-memory data structures and cache solutions, useful for data consistency and performance.

## Event Sets

One theory of Nostr is that a storage (such as a relay) is just an _event set_. Events are discrete values that can be added and removed from a set, but not duplicated.

The [`NSet`](https://jsr.io/@nostrify/nostrify/doc/~/NSet) class implements the ES6 [`Set`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) interface for events.

```ts
import { NSet } from '@nostrify/nostrify';

const set = new NSet();

set.add(event);
set.delete(event);
set.has(event);
set.clear();
set.size;

for (const event of set) {
  console.log(event);
}
```

Additionally, NSet follows NIP-01 behavior:

- Events are sorted reverse-chronologically.
- Replaceable events replace older versions in the set.
- Parameterized events replace older versions in the set.
- Kind 5 deletions remove events from the set (and prevent them from being added).

This makes NSet suitable as an intermediary between untrusted sources (such as relays) and your application, before further processing.

### Customizing NSet

NSet's constructor accepts a Map-like object to store its data (keyed by event ID). You can pass a custom object to NSet to store events in a different way.

```ts
import { LRUCache } from 'lru-cache';

const set = new NSet(new LRUCache({ max: 1000 }));
```

## LRU Cache

Nostrify ships with [`NCache`](https://jsr.io/@nostrify/nostrify/doc/~/NCache), an LRU cache based on NSet and [`lru-cache`](https://www.npmjs.com/package/lru-cache). It also implements NStore, making it a drop-in replacement for databases and relays.

```ts
import { NCache } from '@nostrify/nostrify';

const cache = new NCache({ max: 1000 });

await cache.event(event);
const events = await cache.query([{ kinds: [1, 6], limit: 5 }]);
```

Its constructor accepts the same options as `lru-cache`, and it follows the same NIP-01 behavior as NSet.
An event is marked "recently used" when it matches a filter in `.query()`.

> [!TIP]
> An NCache can be placed in front of another storage to reduce load, or behind another storage as a fallback.
> Consider creating a custom NStore that uses multiple storages internally.

## SQLite

SQLite can also be used as an in-memory storage, but it's mostly useful for testing and development. Pass `:memory:` as the path when connecting to SQLite.

See [SQL Databases](/store/sql) for more information.
