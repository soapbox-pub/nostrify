import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';

export interface NStore {
  event(event: NostrEvent, opts?: NStoreOpts): Promise<void>;
  query(filters: NostrFilter[], opts?: NStoreOpts): Promise<NostrEvent[]>;
  count?(filters: NostrFilter[], opts?: NStoreOpts): Promise<number>;
  remove?(filters: NostrFilter[], opts?: NStoreOpts): Promise<void>;
}

export interface NStoreOpts {
  signal?: AbortSignal;
  relays?: WebSocket['url'][];
  limit?: number;
}
