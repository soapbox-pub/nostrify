import { NostrEvent } from './NostrEvent.ts';

/** Used to send events requested by clients. */
export type NostrRelayEVENT = ['EVENT', subscriptionId: string, NostrEvent];
/** Used to indicate acceptance or denial of an `EVENT` message. */
export type NostrRelayOK = ['OK', eventId: string, ok: boolean, reason: string];
/** Used to indicate the _end of stored events_ and the beginning of events newly received in real-time. */
export type NostrRelayEOSE = ['EOSE', subscriptionId: string];
/** Used to indicate that a subscription was ended on the server side. */
export type NostrRelayCLOSED = ['CLOSED', subscriptionId: string, reason: string];
/** Used to send human-readable error messages or other things to clients. */
export type NostrRelayNOTICE = ['NOTICE', message: string];
/** NIP-45 `COUNT`, used to send counts requested by clients. */
export type NostrRelayCOUNT = ['COUNT', subscriptionId: string, { count: number; approximate?: boolean }];
/** NIP-42 `AUTH`, used to authenticate clients with the relay. */
export type NostrRelayAUTH = ['AUTH', challenge: string];

/** NIP-01 message from a relay to client. */
export type NostrRelayMsg =
  | NostrRelayEVENT
  | NostrRelayOK
  | NostrRelayEOSE
  | NostrRelayCLOSED
  | NostrRelayNOTICE
  | NostrRelayCOUNT
  | NostrRelayAUTH;
