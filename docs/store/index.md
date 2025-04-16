# Storages

In Nostrify, a _storage_ is any object that implements the [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore) interface. This interface defines methods for storing, querying, and removing events.

Storages can be used interchangeably with relays, allowing you to switch between in-memory, SQL databases, and more without changing your code.

## NStore

The [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore) interface defines the following methods:

- `event(event: NostrEvent): Promise<void>`: Insert an event.
- `query(filters: NostrFilter[]): Promise<NostrEvent[]>`: Query events.
- `count(filters: NostrFilter[]): Promise<{ count: number }>`: Count events.
- `remove(filters: NostrFilter[]): Promise<void>`: Remove events.

## Implementations

- [Memory](/store/memory)
- [Postgres](/store/postgres)
- [SQL Databases](/store/sql)
- [Deno KV](/store/denokv)
- [Relays](/relay/)

## Usage

```ts
const store = new NCache();
await store.event(event);
const events = await store.query([{ kinds: [1, 6], limit: 5 }]);
const { count } = await store.count([{ kinds: [1, 6] }]);
await store.remove([{ kinds: [1, 6] }]);
```

## Custom Storages

You can create your own storage by implementing the `NStore` interface. This allows you to store events in any way you choose, such as a custom database or a remote service.

```ts
import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';

class MyStorage implements NStore {
  async event(event: NostrEvent): Promise<void> {
    // Store the event.
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    // Query events.
  }

  async count(filters: NostrFilter[]): Promise<{ count: number }> {
    // Count events.
  }

  async remove(filters: NostrFilter[]): Promise<void> {
    // Remove events.
  }
}
```
