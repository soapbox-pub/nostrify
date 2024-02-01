import { NostrFilter } from './NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from './NostrRelayMsg.ts';
import { NStore, NStoreOpts } from './NStore.ts';

export interface NRelay extends WebSocket, NStore {
  cmd(cmd: [verb: string, ...unknown[]]): Promise<void>;
  req(filters: NostrFilter[], opts?: NStoreOpts): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}
