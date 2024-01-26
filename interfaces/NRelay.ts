import { NostrFilter } from './NostrFilter.ts';
import { NStore, NStoreOpts } from './NStore.ts';
import { NSubscription } from './NSubscription.ts';

export interface NRelay extends WebSocket, NStore {
  cmd(cmd: [verb: string, ...unknown[]]): Promise<void>;
  req(filters: NostrFilter[], opts?: NStoreOpts): Promise<NSubscription>;
}
