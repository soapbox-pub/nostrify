import {
  NostrClientMsg,
  NostrClientREQ,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NostrRelayMsg,
  NostrRelayNOTICE,
  NostrRelayOK,
  NRelay,
} from '@nostrify/types';
import { getFilterLimit, matchFilters, verifyEvent as _verifyEvent } from 'nostr-tools';
import { ArrayQueue, Backoff, ExponentialBackoff, Websocket, WebsocketBuilder, WebsocketEvent } from 'websocket-ts';

import { Machina } from './utils/Machina.ts';
import { NSchema as n } from './NSchema.ts';
import { NSet } from './NSet.ts';

/** Map of EventEmitter events. */
type EventMap = {
  [k: `ok:${string}`]: NostrRelayOK;
  [k: `sub:${string}`]: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED;
  [k: `count:${string}`]: NostrRelayCOUNT;
  notice: NostrRelayNOTICE;
};

/** Options used for constructing an `NRelay1` instance. */
export interface NRelay1Opts {
  /** Respond to `AUTH` challenges by producing a signed kind `22242` event. */
  auth?(challenge: string): Promise<NostrEvent>;
  /** Configure reconnection strategy, or set to `false` to disable. Default: `new ExponentialBackoff(1000)`. */
  backoff?: Backoff | false;
  /** How long to wait (in milliseconds) for the caller to create a subscription before closing the connection. Set to `false` to disable. Default: `30_000`. */
  idleTimeout?: number | false;
  /** Ensure the event is valid before returning it. Default: `nostrTools.verifyEvent`. */
  verifyEvent?(event: NostrEvent): boolean;
}

/** Single relay connection over WebSocket. */
export class NRelay1 implements NRelay {
  socket: Websocket;

  private subscriptions = new Map<string, NostrClientREQ>();
  private closedByUser = false;
  private idleTimer?: number;

  private ee = new EventTarget();

  constructor(private url: string, private opts: NRelay1Opts = {}) {
    this.socket = this.createSocket();
  }

  /** Create (and open) a WebSocket connection with automatic reconnect. */
  private createSocket(): Websocket {
    const { backoff = new ExponentialBackoff(1000) } = this.opts;

    return new WebsocketBuilder(this.url)
      .withBuffer(new ArrayQueue())
      .withBackoff(backoff === false ? undefined : backoff)
      .onOpen(() => {
        for (const req of this.subscriptions.values()) {
          this.send(req);
        }
      })
      .onClose(() => {
        // If the connection closes on its own and there are no active subscriptions, let it stay closed.
        if (!this.subscriptions.size) {
          this.socket.close();
        }
      })
      .onMessage((_ws, ev) => {
        const result = n.json().pipe(n.relayMsg()).safeParse(ev.data);

        if (result.success) {
          this.receive(result.data);
        }
      })
      .build();
  }

  /** Handle a NIP-01 relay message. */
  protected receive(msg: NostrRelayMsg): void {
    const { auth, verifyEvent = _verifyEvent } = this.opts;

    switch (msg[0]) {
      case 'EVENT':
        if (!verifyEvent(msg[2])) break;
        this.ee.dispatchEvent(new CustomEvent(`sub:${msg[1]}`, { detail: msg }));
        break;
      case 'EOSE':
        this.ee.dispatchEvent(new CustomEvent(`sub:${msg[1]}`, { detail: msg }));
        break;
      case 'CLOSED':
        this.subscriptions.delete(msg[1]);
        this.maybeStartIdleTimer();
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
        auth?.(msg[1]).then((event) => this.send(['AUTH', event])).catch(() => {});
    }
  }

  /** Send a NIP-01 client message to the relay. */
  protected send(msg: NostrClientMsg): void {
    this.wake();

    switch (msg[0]) {
      case 'REQ':
        this.subscriptions.set(msg[1], msg);
        break;
      case 'CLOSE':
        this.subscriptions.delete(msg[1]);
        this.maybeStartIdleTimer();
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

  /** Get a stream of EE events. */
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

  /** Wait for a single EE event. */
  private async once<K extends keyof EventMap>(key: K, signal?: AbortSignal): Promise<EventMap[K]> {
    for await (const msg of this.on(key, signal)) {
      return msg;
    }
    throw new Error('Unreachable');
  }

  protected abortError(): DOMException {
    return new DOMException('The signal has been aborted', 'AbortError');
  }

  /** Start the idle time if applicable. */
  private maybeStartIdleTimer(): void {
    const { idleTimeout = 30_000 } = this.opts;

    // If the idle timeout is disabled, do nothing.
    if (idleTimeout === false) return;
    // If a timer is already running, let it continue without disruption.
    if (this.idleTimer) return;
    // If there are still subscriptions, the connection is not "idle".
    if (this.subscriptions.size) return;
    // If the connection was manually closed, there's no need to start a timer.
    if (this.closedByUser) return;

    this.idleTimer = setTimeout(() => this.socket.close(), idleTimeout);
  }

  /** Stop the idle timer. */
  private stopIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /** Make a new WebSocket, but only if it was closed by an idle timeout. */
  private wake(): void {
    this.stopIdleTimer();

    if (!this.closedByUser && this.socket.closedByUser) {
      this.socket = this.createSocket();
    }
  }

  /**
   * Close the relay connection and prevent it from reconnecting.
   * After this you should dispose of the `NRelay1` instance and create a new one to connect again.
   */
  async close(): Promise<void> {
    this.closedByUser = true;
    this.socket.close();
    this.stopIdleTimer();

    if (this.socket.readyState !== WebSocket.CLOSED) {
      await new Promise((resolve) => {
        this.socket.addEventListener(WebsocketEvent.close, resolve, { once: true });
      });
    }
  }
}
