import { DefaultEventMap, EventEmitter } from 'npm:tseep@^1.2.1';
import { ExponentialBackoff, Websocket, WebsocketBuilder } from 'npm:websocket-ts@^2.1.5';

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
import { NRelay, NReqOpts } from '../interfaces/NRelay.ts';
import { NStoreOpts } from '../interfaces/NStore.ts';

import { Machina } from './Machina.ts';
import { NSchema as n } from './NSchema.ts';

type NiceRelayEventMap = DefaultEventMap & {
  [k: `sub:${string}`]: (msg: NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED) => void;
  [k: `ok:${string}`]: (msg: NostrRelayOK) => void;
  notice: (msg: NostrRelayNOTICE) => void;
  [k: `count:${string}`]: (msg: NostrRelayCOUNT) => void;
};

export class NiceRelay implements NRelay {
  socket: Websocket;
  subscriptions: NostrClientREQ[] = [];

  #ee = new EventEmitter<NiceRelayEventMap>();

  constructor(url: string) {
    this.socket = new WebsocketBuilder(url)
      .withBackoff(new ExponentialBackoff(1000))
      .onOpen(() => {
        for (const req of this.subscriptions) {
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
            if (msg[0] === 'CLOSED') {
              this.removeSubscription(msg[1]);
            }
            this.#ee.emit(`sub:${msg[1]}`, msg);
            break;
          case 'OK':
            this.#ee.emit(`ok:${msg[1]}`, msg);
            break;
          case 'NOTICE':
            this.#ee.emit('notice', msg);
            break;
          case 'COUNT':
            this.#ee.emit(`count:${msg[1]}`, msg);
            break;
        }
      })
      .build();
  }

  async *req(
    filters: NostrFilter[],
    opts: NReqOpts = {},
  ): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { subscriptionId = crypto.randomUUID(), signal } = opts;

    const msgs = this.#on<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(`sub:${subscriptionId}`, signal);
    const req: NostrClientREQ = ['REQ', subscriptionId, ...filters];

    this.subscriptions.push(req);
    this.send(req);

    for await (const msg of msgs) {
      if (msg[0] === 'CLOSED') break;
      try {
        yield msg;
      } finally {
        this.closeSubscription(subscriptionId);
      }
    }
  }

  async event(event: NostrEvent, opts?: NStoreOpts): Promise<void> {
    const result = this.#once<NostrRelayOK>(`ok:${event.id}`, opts?.signal);

    this.send(['EVENT', event]);

    const [, , ok, reason] = await result;

    if (!ok) {
      throw new Error(reason);
    }
  }

  async query(filters: NostrFilter[], opts?: NStoreOpts): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for await (const msg of this.req(filters, opts)) {
      if (msg[0] === 'EOSE') break;
      if (msg[0] === 'EVENT') events.push(msg[2]);
      if (msg[0] === 'CLOSED') throw new Error('Subscription closed');
    }

    return events;
  }

  async count(filters: NostrFilter[], opts?: NStoreOpts): Promise<{ count: number; approximate?: boolean }> {
    const subscriptionId = crypto.randomUUID();
    const result = this.#once<NostrRelayCOUNT>(`count:${subscriptionId}`, opts?.signal);

    this.send(['COUNT', subscriptionId, ...filters]);

    const [, , count] = await result;
    return count;
  }

  #once<T>(key: string, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(this.abortError());

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        this.#ee.off(key, onEvent);
      };

      const onAbort = () => {
        cleanup();
        reject(this.abortError());
      };

      const onEvent = (msg: unknown) => {
        cleanup();
        resolve(msg as T);
      };

      signal?.addEventListener('abort', onAbort);
      this.#ee.once(key, onEvent);
    });
  }

  async *#on<T>(key: string, signal?: AbortSignal): AsyncGenerator<T> {
    if (signal?.aborted) throw this.abortError();

    const machina = new Machina<T>(signal);
    const onMsg = (msg: T) => machina.push(msg);

    const cleanup = () => {
      signal?.removeEventListener('abort', cleanup);
      this.#ee.off(key, onMsg);
    };

    signal?.addEventListener('abort', cleanup);
    this.#ee.on(key, onMsg);

    for await (const msg of machina) {
      try {
        yield msg;
      } finally {
        cleanup();
      }
    }
  }

  protected removeSubscription(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter((req) => req[1] !== subscriptionId);
  }

  protected closeSubscription(subscriptionId: string): void {
    this.removeSubscription(subscriptionId);
    this.send(['CLOSE', subscriptionId]);
  }

  protected abortError() {
    return new DOMException('The signal has been aborted', 'AbortError');
  }

  protected send(msg: NostrClientMsg): void {
    return this.socket.send(JSON.stringify(msg));
  }
}
