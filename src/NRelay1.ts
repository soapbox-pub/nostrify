import { getFilterLimit, matchFilters, verifyEvent as _verifyEvent } from 'nostr-tools';
import { ArrayQueue, Backoff, ExponentialBackoff, Websocket, WebsocketBuilder, WebsocketEvent } from 'websocket-ts';

import { NostrClientMsg, NostrClientREQ } from '../interfaces/NostrClientMsg.ts';
import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import {
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NostrRelayNOTICE,
  NostrRelayOK,
} from '../interfaces/NostrRelayMsg.ts';
import { NRelay } from '../interfaces/NRelay.ts';

import { Machina } from './utils/Machina.ts';
import { NSchema as n } from './NSchema.ts';
import { NSet } from './NSet.ts';

type EventMap = {
  [k: `ok:${string}`]: NostrRelayOK;
  [k: `sub:${string}`]: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED;
  [k: `count:${string}`]: NostrRelayCOUNT;
  notice: NostrRelayNOTICE;
};

export interface NRelay1Opts {
  /** Respond to `AUTH` challenges by producing a signed kind `22242` event. */
  auth?(challenge: string): Promise<NostrEvent>;
  /** Configure reconnection strategy, or set to `false` to disable. Default: `new ExponentialBackoff(1000)`. */
  backoff?: Backoff | false;
  /** Ensure the event is valid before returning it. Default: `nostrTools.verifyEvent`. */
  verifyEvent?(event: NostrEvent): boolean;
}

export class NRelay1 implements NRelay {
  readonly socket: Websocket;

  private subscriptions = new Map<string, NostrClientREQ>();
  private ee = new EventTarget();

  constructor(url: string, opts: NRelay1Opts = {}) {
    const { auth, backoff = new ExponentialBackoff(1000), verifyEvent = _verifyEvent } = opts;

    this.socket = new WebsocketBuilder(url)
      .withBuffer(new ArrayQueue())
      .withBackoff(backoff === false ? undefined : backoff)
      .onOpen(() => {
        for (const req of this.subscriptions.values()) {
          this.send(req);
        }
      })
      .onMessage((_ws, ev) => {
        const result = n.json().pipe(n.relayMsg()).safeParse(ev.data);
        if (!result.success) return;
        const msg = result.data;
        switch (msg[0]) {
          case 'EVENT':
          case 'EOSE':
          case 'CLOSED':
            if (msg[0] === 'EVENT' && !verifyEvent(msg[2])) break;
            if (msg[0] === 'CLOSED') this.subscriptions.delete(msg[1]);
            this.ee.dispatchEvent(new CustomEvent(`sub:${msg[1]}`, { detail: msg }));
            break;
          case 'OK':
            this.ee.dispatchEvent(new CustomEvent(`ok:${msg[1]}`, { detail: msg }));
            break;
          case 'NOTICE':
            this.ee.dispatchEvent(new CustomEvent('notice', { detail: msg }));
            break;
          case 'COUNT':
            this.ee.dispatchEvent(new CustomEvent(`count:${msg[1]}`, { detail: msg }));
            break;
          case 'AUTH':
            auth?.(msg[1]).then((event) => this.send(['AUTH', event])).catch(() => { });
        }
      })
      .build();
  }

  protected send(msg: NostrClientMsg): void {
    switch (msg[0]) {
      case 'REQ':
        this.subscriptions.set(msg[1], msg);
        break;
      case 'CLOSE':
        this.subscriptions.delete(msg[1]);
        break;
      case 'EVENT':
      case 'COUNT':
        return this.socket.send(JSON.stringify(msg));
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  async *req(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal } = {},
  ): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { signal } = opts;
    const subscriptionId = crypto.randomUUID();

    const msgs = this.on(`sub:${subscriptionId}`, signal);
    const req: NostrClientREQ = ['REQ', subscriptionId, ...filters];

    this.send(req);

    try {
      for await (const msg of msgs) {
        if (msg[0] === 'EOSE') yield msg;
        if (msg[0] === 'CLOSED') break;
        if (msg[0] === 'EVENT') {
          if (matchFilters(filters, msg[2])) {
            yield msg;
          } else {
            continue;
          }
        }
      }
    } finally {
      this.send(['CLOSE', subscriptionId]);
    }
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const events = new NSet();

    const limit = filters.reduce((result, filter) => result + getFilterLimit(filter), 0);
    if (limit === 0) return [];

    for await (const msg of this.req(filters, opts)) {
      if (msg[0] === 'EOSE') break;
      if (msg[0] === 'EVENT') events.add(msg[2]);
      if (msg[0] === 'CLOSED') throw new Error('Subscription closed');

      if (events.size >= limit) {
        break;
      }
    }

    return [...events];
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const result = this.once(`ok:${event.id}`, opts?.signal);

    this.send(['EVENT', event]);

    const [, , ok, reason] = await result;

    if (!ok) {
      throw new Error(reason);
    }
  }

  async count(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<{ count: number; approximate?: boolean }> {
    const subscriptionId = crypto.randomUUID();
    const result = this.once(`count:${subscriptionId}`, opts?.signal);

    this.send(['COUNT', subscriptionId, ...filters]);

    const [, , count] = await result;
    return count;
  }

  private async *on<K extends keyof EventMap>(key: K, signal?: AbortSignal): AsyncIterable<EventMap[K]> {
    if (signal?.aborted) throw this.abortError();

    const machina = new Machina<EventMap[K]>(signal);
    const onMsg = (e: Event) => machina.push((e as CustomEvent<EventMap[K]>).detail);

    this.ee.addEventListener(key, onMsg);

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      this.ee.removeEventListener(key, onMsg);
    }
  }

  private async once<K extends keyof EventMap>(key: K, signal?: AbortSignal): Promise<EventMap[K]> {
    for await (const msg of this.on(key, signal)) {
      return msg;
    }
    throw new Error('Unreachable');
  }

  protected abortError(): DOMException {
    return new DOMException('The signal has been aborted', 'AbortError');
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      this.socket.addEventListener(WebsocketEvent.close, resolve, { once: true });
      this.socket.close();
    });
  }
}
