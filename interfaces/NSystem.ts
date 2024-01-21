import { MapCache } from './MapCache.ts';
import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NStore } from './NStore.ts';

export interface NSystem<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> {
  events: NStore<T, F>;
  nip05: MapCache<string, NProfilePointer, FetchOpts>;
  lnurl: MapCache<string, LNDetails, FetchOpts>;
}

interface NProfilePointer {
  pubkey: string;
  relays?: WebSocket['url'][];
}

interface LNDetails {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: 'payRequest';
}

interface FetchOpts {
  signal?: AbortSignal | null;
}
