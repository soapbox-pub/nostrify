import { NostrEvent } from './NostrEvent.ts';

// deno-lint-ignore no-empty-interface
export interface NSet<T extends NostrEvent = NostrEvent> extends Set<T> {}
