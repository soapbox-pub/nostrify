import { NostrEvent } from './NostrEvent.ts';
import { NostrFilter } from './NostrFilter.ts';

/** Used to publish events.. */
export type NostrClientEVENT = ['EVENT', NostrEvent];
/** Used to request events and subscribe to new updates. */
export type NostrClientREQ = ['REQ', subscriptionId: string, ...NostrFilter[]];
/** Used to stop previous subscriptions. */
export type NostrClientCLOSE = ['CLOSE', subscriptionId: string];
/** NIP-45 `COUNT`, used to request a count of all events matching the filters . */
export type NostrClientCOUNT = [
  'COUNT',
  subscriptionId: string,
  ...NostrFilter[],
];
/** NIP-42 `AUTH`, used to authenticate the client to the relay. */
export type NostrClientAUTH = ['AUTH', NostrEvent];

/** NIP-01 message from a client to relay. */
export type NostrClientMsg =
  | NostrClientEVENT
  | NostrClientREQ
  | NostrClientCOUNT
  | NostrClientCLOSE
  | NostrClientAUTH;
