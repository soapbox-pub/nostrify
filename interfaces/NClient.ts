import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';
import { NStore } from './NStore.ts';

export interface NClient extends NStore {
  req(filters: NostrFilter[]): AsyncGenerator<NostrEvent>;
}
