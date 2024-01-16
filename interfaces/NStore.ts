import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';

export interface NStore<T extends NostrEvent = NostrEvent, F extends NostrFilter = NostrFilter> {
  add(event: T): Promise<this>;
  filter(filters: F[]): Promise<T[]>;
}
