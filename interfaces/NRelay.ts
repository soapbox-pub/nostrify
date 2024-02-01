import { NostrFilter } from './NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from './NostrRelayMsg.ts';
import { NStore, NStoreOpts } from './NStore.ts';

export interface NRelay extends NStore {
  req(filters: NostrFilter[], opts?: NStoreOpts): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}
