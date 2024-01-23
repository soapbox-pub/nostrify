import { LNURLDetails } from './LNURLDetails.ts';
import { MapCache } from './MapCache.ts';
import { NProfilePointer } from './NProfilePointer.ts';
import { NStore } from './NStore.ts';

export interface NSystem {
  events: NStore;
  nip05: MapCache<string, NProfilePointer, FetchOpts>;
  lnurl: MapCache<string, LNURLDetails, FetchOpts>;
}

interface FetchOpts {
  signal?: AbortSignal | null;
}
