import { MapCache } from './MapCache.ts';
import { NStore } from './NStore.ts';

export interface NSystem {
  events: NStore;
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
