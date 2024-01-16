import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NStore } from './NStore.ts';

export interface NRelay extends NStore {
  req(filters: NostrFilter[]): AsyncGenerator<NostrEvent>;
}
