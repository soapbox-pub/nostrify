import { matchFilters } from 'nostr-tools';

import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/types';

export class IdbRelay implements NRelay {
  private db: Promise<IDBDatabase>;

  constructor(name: string) {
    this.db = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);

      request.onerror = () => {
        const error = new Error('Failed to open IndexedDB');
        reject(error);
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore('nostr_events', { keyPath: 'id' });
      };
    });
  }

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const subId = crypto.randomUUID();

    for (const event of await this.query(filters, opts)) {
      yield ['EVENT', subId, event];
    }

    yield ['EOSE', subId];
    yield ['CLOSED', subId, 'error: streaming is not supported'];
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const db = await this.db;

    return new Promise((resolve, reject) => {
      if (opts?.signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      const transaction = db.transaction(['nostr_events'], 'readwrite');
      const store = transaction.objectStore('nostr_events');
      const request = store.put(event);

      const abortHandler = () => {
        transaction.abort();
        reject(new Error('Operation aborted'));
      };

      opts?.signal?.addEventListener('abort', abortHandler);

      request.onerror = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        reject(new Error('Failed to store event'));
      };

      request.onsuccess = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        resolve();
      };
    });
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const db = await this.db;

    return new Promise((resolve, reject) => {
      if (opts?.signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      const transaction = db.transaction(['nostr_events'], 'readonly');
      const store = transaction.objectStore('nostr_events');
      const request = store.getAll();

      const abortHandler = () => {
        transaction.abort();
        reject(new Error('Operation aborted'));
      };

      opts?.signal?.addEventListener('abort', abortHandler);

      request.onerror = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        reject(new Error('Failed to query events'));
      };

      request.onsuccess = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        const events = request.result as NostrEvent[];
        resolve(events.filter((event) => matchFilters(filters, event)));
      };
    });
  }

  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    const events = await this.query(filters, opts);
    return { count: events.length, approximate: false };
  }

  async remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    const db = await this.db;

    return new Promise((resolve, reject) => {
      if (opts?.signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      const transaction = db.transaction(['nostr_events'], 'readwrite');
      const store = transaction.objectStore('nostr_events');
      const request = store.getAll();

      const abortHandler = () => {
        transaction.abort();
        reject(new Error('Operation aborted'));
      };

      opts?.signal?.addEventListener('abort', abortHandler);

      request.onerror = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        reject(new Error('Failed to query events'));
      };

      request.onsuccess = () => {
        opts?.signal?.removeEventListener('abort', abortHandler);
        const events = request.result as NostrEvent[];
        const toDelete = events.filter((event) => matchFilters(filters, event));
        const promises = toDelete.map((event) => store.delete(event.id));

        Promise.all(promises).then(() => {
          resolve();
        }).catch((error) => {
          reject(error);
        });
      };
    });
  }

  async close(): Promise<void> {
    const db = await this.db;
    db.close();
  }
}
