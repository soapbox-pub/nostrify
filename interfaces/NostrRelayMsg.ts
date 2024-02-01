import { NostrEvent } from './NostrEvent.ts';

export type NostrRelayOK = ['OK', eventId: string, ok: boolean, reason: string];
export type NostrRelayEVENT = ['EVENT', subscriptionId: string, NostrEvent];
export type NostrRelayEOSE = ['EOSE', subscriptionId: string];
export type NostrRelayCLOSED = ['CLOSED', subscriptionId: string, reason: string];
export type NostrRelayNOTICE = ['NOTICE', message: string];
export type NostrRelayCOUNT = ['COUNT', subscriptionId: string, { count: number; approximate?: boolean }];

export type NostrRelayMsg = NostrRelayEVENT | NostrRelayOK | NostrRelayEOSE | NostrRelayNOTICE | NostrRelayCOUNT;
