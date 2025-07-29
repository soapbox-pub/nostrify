import { NostrFilter } from './NostrFilter';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from './NostrRelayMsg';
import { NStore } from './NStore';

/** Nostr event store with support for relay subscriptions. */
export interface NRelay extends NStore {
  /** Subscribe to events matching the given filters. Returns an iterator of raw NIP-01 relay messages. */
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
  /** Closes the connection to the relay. */
  close(): Promise<void>;
}
