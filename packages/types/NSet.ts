import { NostrEvent } from './NostrEvent.ts';

/** Nostr event implementation of the `Set` interface. */
export interface NSet extends Set<NostrEvent> {}
