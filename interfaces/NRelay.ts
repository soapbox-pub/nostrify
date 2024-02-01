import { NostrFilter } from './NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from './NostrRelayMsg.ts';
import { NStore, NStoreOpts } from './NStore.ts';

/** Nostr event store with support for relay subscriptions. */
export interface NRelay extends NStore {
  /** Subscribe to events matching the given filters. Returns an iterator of raw NIP-01 relay messages. */
  req(filters: NostrFilter[], opts?: NStoreOpts): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}
