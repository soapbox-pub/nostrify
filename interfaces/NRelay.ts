import { NostrFilter } from './NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from './NostrRelayMsg.ts';
import { NStore, NStoreOpts } from './NStore.ts';

export interface NReqOpts extends NStoreOpts {
  /** ID to use for the `REQ` to the relay. */
  subscriptionId?: string;
}

/** Nostr event store with support for relay subscriptions. */
export interface NRelay extends NStore {
  /** Subscribe to events matching the given filters. Returns an iterator of raw NIP-01 relay messages. */
  req(filters: NostrFilter[], opts?: NReqOpts): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}
