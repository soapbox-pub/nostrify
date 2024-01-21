import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';

export interface NStore<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> {
  event(event: T, opts?: NStoreOpts): Promise<void>;
  query(filters: F[], opts?: NStoreOpts): Promise<T[]>;
  count?(filters: F[], opts?: NStoreOpts): Promise<number>;
  remove?(filters: F[], opts?: NStoreOpts): Promise<void>;
}

export interface NStoreOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
  limit?: number;
}
