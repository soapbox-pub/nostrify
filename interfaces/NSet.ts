import { NostrEvent } from './NostrEvent.ts';

/** Nostr event implementation of the `Set` interface. */
// deno-lint-ignore no-empty-interface
export interface NSet extends Set<NostrEvent> {}
