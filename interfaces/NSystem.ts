import { LNURLDetails } from './LNURLDetails.ts';
import { MapCache } from './MapCache.ts';
import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NProfilePointer } from './NProfilePointer.ts';
import { NStore } from './NStore.ts';

export interface NSystem<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> {
  events: NStore<T, F>;
  nip05: MapCache<string, NProfilePointer, FetchOpts>;
  lnurl: MapCache<string, LNURLDetails, FetchOpts>;
}

interface FetchOpts {
  signal?: AbortSignal | null;
}
