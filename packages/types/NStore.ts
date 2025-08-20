import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NostrRelayCOUNT } from './NostrRelayMsg.ts';

/** Nostr event store. */
export interface NStore {
  /** Add an event to the store (equivalent of `EVENT` verb). */
  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
  /** Get an array of events matching filters. */
  query(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<NostrEvent[]>;
  /** Get the number of events matching filters (equivalent of `COUNT` verb). */
  count?(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<NostrRelayCOUNT[2]>;
  /** Remove events from the store. This action is temporary, unless a kind `5` deletion is issued. */
  remove?(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<void>;
}
