import { NostrEvent } from './NostrEvent.js';

/** Nostr event implementation of the `Set` interface. */
export interface NSet extends Set<NostrEvent> {}
