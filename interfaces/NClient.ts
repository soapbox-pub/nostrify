import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NStore } from './NStore.ts';

export interface NClient<T extends NostrEvent, F extends NostrFilter> extends NStore<T, F> {
  req(filters: F[]): AsyncGenerator<T>;
}
