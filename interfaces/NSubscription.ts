import { NostrFilter } from './NostrFilter.ts';

export interface NSubscription extends EventTarget {
  uuid: string;
  filters: NostrFilter[];
  relays?: WebSocket['url'][];
}
