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
import { NKinds } from './NKinds.ts';

/** Map of EventEmitter events. */
type EventMap = {
  [k: `ok:${string}`]: NostrRelayOK;
  [k: `sub:${string}`]: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED;
  [k: `count:${string}`]: NostrRelayCOUNT | NostrRelayCLOSED;
  [k: `id:${string}`]: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED;
  [k: `addr:${string}`]: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED;
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
  /** Logger callback. */
  log?(log: NRelay1Log): void;
}

export interface NRelay1Log {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'critical';
  ns: string;
  [k: string]: JsonValue | undefined | { toJSON(): JsonValue } | Error;
}

/** Single relay connection over WebSocket. */
export class NRelay1 implements NRelay {
  socket: Websocket;

  private subs = new Map<string, NostrClientREQ>();
  private closedByUser = false;
  private idleTimer?: number;
  private controller = new AbortController();

  private ids = new Set<string>();
  private addrs = new Set<string>();
  private scheduled = false;

  private ee = new EventTarget();

  get subscriptions(): readonly NostrClientREQ[] {
    return [...this.subs.values()];
  }

  private log(log: NRelay1Log): void {
    this.opts.log?.({ ...log, url: this.url });
  }

  constructor(private url: string, private opts: NRelay1Opts = {}) {
    this.socket = this.createSocket();
    this.maybeStartIdleTimer();
  }

  /** Create (and open) a WebSocket connection with automatic reconnect. */
  private createSocket(): Websocket {
    const { backoff = new ExponentialBackoff(1000) } = this.opts;

    return new WebsocketBuilder(this.url)
      .withBuffer(new ArrayQueue())
      .withBackoff(backoff === false ? undefined : backoff)
      .onOpen((socket) => {
        this.log({
          level: 'debug',
          ns: 'relay.ws.state',
          state: 'open',
          readyState: socket.readyState,
        });
        for (const req of this.subs.values()) {
          this.send(req);
        }
      })
      .onClose((socket) => {
        this.log({
          level: 'debug',
          ns: 'relay.ws.state',
          state: 'close',
          readyState: socket.readyState,
        });
        // If the connection closes on its own and there are no active subscriptions, let it stay closed.
        if (!this.subs.size) {
          this.socket.close();
        }
      })
      .onReconnect((socket) => {
        this.log({
          level: 'debug',
          ns: 'relay.ws.state',
          state: 'reconnect',
          readyState: socket.readyState,
        });
      })
      .onRetry((socket, e) => {
        this.log({
          level: 'warn',
          ns: 'relay.ws.retry',
          readyState: socket.readyState,
          backoff: e.detail.backoff,
        });
      })
      .onError((socket) => {
        this.log({ level: 'error', ns: 'relay.ws.error', readyState: socket.readyState });
      })
      .onMessage((_socket, e) => {
        if (typeof e.data !== 'string') {
          this.close();
          return;
        }

        const result = n.json().pipe(n.relayMsg()).safeParse(e.data);

        if (result.success) {
          this.log({ level: 'trace', ns: 'relay.ws.message', data: result.data as JsonValue });
          this.receive(result.data);
        } else {
          this.log({ level: 'warn', ns: 'relay.ws.message', error: result.error });
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
        this.subs.delete(msg[1]);
        this.maybeStartIdleTimer();
        this.ee.dispatchEvent(new CustomEvent(`sub:${msg[1]}`, { detail: msg }));
        this.ee.dispatchEvent(new CustomEvent(`count:${msg[1]}`, { detail: msg }));
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
    this.log({ level: 'trace', ns: 'relay.ws.send', data: msg as JsonValue });
    this.wake();

    switch (msg[0]) {
      case 'REQ':
        this.subs.set(msg[1], msg);
        break;
      case 'CLOSE':
        this.subs.delete(msg[1]);
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
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    if (filters.every((filter) => this.isIdsOnlyFilter(filter) || this.isReplaceableFilter(filter))) {
      for (const msg of await this.reqBatched(filters, opts)) {
        yield msg;
      }
      return;
    }

    for await (const msg of this.raw(filters, opts)) {
      yield msg;
    }
  }

  /** Underlying, true REQ method. */
  private async *raw(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal } = {},
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
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

    try {
      this.send(['EVENT', event]);
    } catch (e) {
      result.catch(() => {});
      throw e;
    }

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

    try {
      this.send(['COUNT', subscriptionId, ...filters]);
    } catch (e) {
      result.catch(() => {});
      throw e;
    }

    const msg = await result;

    switch (msg[0]) {
      case 'CLOSED':
        throw new Error('Subscription closed');
      case 'COUNT': {
        const [, , count] = msg;
        return count;
      }
    }
  }

  /** Get a stream of EE events. */
  private async *on<K extends keyof EventMap>(key: K, signal?: AbortSignal): AsyncIterable<EventMap[K]> {
    const _signal = signal ? AbortSignal.any([this.controller.signal, signal]) : this.controller.signal;

    if (_signal.aborted) throw this.abortError();

    const machina = new Machina<EventMap[K]>(_signal);
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
    if (this.subs.size) return;
    // If the connection was manually closed, there's no need to start a timer.
    if (this.closedByUser) return;

    this.log({ level: 'debug', ns: 'relay.idletimer', state: 'running', timeout: idleTimeout });

    this.idleTimer = setTimeout(() => {
      this.log({ level: 'debug', ns: 'relay.idletimer', state: 'aborted', timeout: idleTimeout });
      this.socket.close();
    }, idleTimeout);
  }

  /** Stop the idle timer. */
  private stopIdleTimer(): void {
    this.log({ level: 'debug', ns: 'relay.idletimer', state: 'stopped' });
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /** Make a new WebSocket, but only if it was closed by an idle timeout. */
  private wake(): void {
    this.stopIdleTimer();

    if (!this.closedByUser && this.socket.closedByUser) {
      this.log({ level: 'debug', ns: 'relay.wake', state: 'awoken' });
      this.socket = this.createSocket();
    } else if (this.closedByUser || this.socket.closedByUser) {
      this.log({ level: 'debug', ns: 'relay.wake', state: 'closed' });
    } else {
      this.log({ level: 'debug', ns: 'relay.wake', state: 'awake' });
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
    this.controller.abort();

    if (this.socket.readyState !== WebSocket.CLOSED) {
      await new Promise((resolve) => {
        this.socket.addEventListener(WebsocketEvent.close, resolve, { once: true });
      });
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /** Checks if the filter is only trying to get events by id. */
  private isIdsOnlyFilter(filter: NostrFilter): filter is { ids: string[]; limit?: number } {
    const keys = ['ids', 'limit'];

    // First check that we only have allowed keys.
    if (!Object.keys(filter).every((key) => keys.includes(key))) {
      return false;
    }

    // Then check the specific requirements for each key.
    return keys.every((key) => {
      if (key === 'ids') {
        return Array.isArray(filter.ids);
      }
      if (key === 'limit') {
        return filter.limit === undefined || filter.limit === filter.ids?.length;
      }
    });
  }

  /** Checks if the filter is only trying to get replaceable events by author. */
  private isReplaceableFilter(filter: NostrFilter): filter is { kinds: [number]; authors: string[]; limit?: number } {
    const keys = ['kinds', 'authors', 'limit'];

    // First check that we only have allowed keys.
    if (!Object.keys(filter).every((key) => keys.includes(key))) {
      return false;
    }

    // Then check the specific requirements for each key.
    return keys.every((key) => {
      if (key === 'kinds') {
        return filter.kinds?.length === 1 && NKinds.replaceable(filter.kinds[0]);
      }
      if (key === 'authors') {
        return Array.isArray(filter.authors);
      }
      if (key === 'limit') {
        return filter.limit === undefined || filter.limit === filter.authors?.length;
      }
    });
  }

  /** Schedule batch processing for the end of the current tick. */
  private scheduleBatch(): void {
    if (!this.scheduled) {
      this.scheduled = true;
      Promise.resolve().then(() => this.processBatch());
    }
  }

  /** Request batched filters. */
  private reqBatched(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<Array<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>> {
    const promises: Promise<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>[] = [];

    for (const filter of filters) {
      if (this.isIdsOnlyFilter(filter)) {
        for (const id of filter.ids) {
          promises.push(this.once(`id:${id}`, opts?.signal));
          this.ids.add(id);
        }
      }

      if (this.isReplaceableFilter(filter)) {
        for (const author of filter.authors) {
          const addr = `${filter.kinds[0]}:${author}:`;
          promises.push(this.once(`addr:${addr}`, opts?.signal));
          this.addrs.add(addr);
        }
      }
    }

    this.scheduleBatch();

    return Promise.all(promises);
  }

  /** Process the batched requests and send the actual subscriptions. */
  private async processBatch(): Promise<void> {
    const signal = this.controller.signal;
    const promises: Promise<void>[] = [];

    if (this.ids.size) {
      promises.push((async () => {
        for await (const msg of this.raw([{ ids: [...this.ids] }], { signal })) {
          if (msg[0] === 'EVENT') {
            const [, , event] = msg;
            this.ids.delete(event.id);
            this.ee.dispatchEvent(new CustomEvent(`id:${event.id}`, { detail: msg }));
          } else {
            for (const id of this.ids) {
              this.ee.dispatchEvent(new CustomEvent(`id:${id}`, { detail: msg }));
            }
            break;
          }
          if (this.ids.size === 0) {
            break;
          }
        }
      })());
    }

    if (this.addrs.size) {
      const kinds = new Set<number>();

      for (const addr of this.addrs) {
        const [kind] = addr.split(':');
        kinds.add(Number(kind));
      }

      for (const kind of kinds) {
        const authors = new Set<string>();

        for (const addr of this.addrs) {
          const [k, author] = addr.split(':');
          if (Number(k) === kind) {
            authors.add(author);
          }
        }

        promises.push((async () => {
          for await (const msg of this.raw([{ kinds: [kind], authors: [...authors] }], { signal })) {
            if (msg[0] === 'EVENT') {
              const [, , event] = msg;
              const addr = `${kind}:${event.pubkey}:`;
              this.addrs.delete(addr);
              this.ee.dispatchEvent(new CustomEvent(`addr:${addr}`, { detail: msg }));
            } else {
              for (const addr of this.addrs) {
                const [k] = addr.split(':');
                if (Number(k) === kind) {
                  this.addrs.delete(addr);
                  this.ee.dispatchEvent(new CustomEvent(`addr:${addr}`, { detail: msg }));
                }
              }
              break;
            }
            if (this.addrs.size === 0) {
              break;
            }
          }
        })());
      }
    }

    await Promise.all(promises);

    // Clear the batches as they've been processed.
    this.ids.clear();
    this.addrs.clear();
    this.scheduled = false;
  }
}

/** Native JSON primitive value, including objects and arrays. */
type JsonValue =
  | { [key: string]: JsonValue | undefined }
  | JsonValue[]
  | string
  | number
  | boolean
  | null;
