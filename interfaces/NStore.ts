import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';

export interface NStore<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> {
  save(event: T, opts?: NStoreAddOpts): Promise<void>;
  filter(filters: F[], opts?: NStoreFilterOpts): Promise<T[]>;
  count?(filters: F[], opts?: NStoreCountOpts): Promise<number>;
  remove?(filters: F[], opts?: NStoreRemoveOpts): Promise<void>;
}

export interface NStoreAddOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
}

export interface NStoreFilterOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
  limit?: number;
}

export interface NStoreCountOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
}

export interface NStoreRemoveOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
}
