import { NostrEvent, NostrFilter, NostrRelayCOUNT, NStore } from '@nostrify/types';

/** Postgres storage implementation optimized for Postgres-specific features. */
export class NPostgres implements NStore {
  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    throw new Error('Method not implemented.');
  }

  count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    throw new Error('Method not implemented.');
  }

  remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
