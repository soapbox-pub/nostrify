import { getFilterLimit } from 'npm:nostr-tools@^2.3.1';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '../interfaces/NostrRelayMsg.ts';
import { NRelay } from '../interfaces/NRelay.ts';

import { Machina } from './Machina.ts';
import { NKinds } from './NKinds.ts';
import { NSet } from './NSet.ts';

export interface NPoolOpts {
  /** Creates an `NRelay` instance for the given URL. */
  open(url: WebSocket['url']): NRelay;
  /** Determines the relays to use for making `REQ`s to the given filters. To support the Outbox model, it should analyze the `authors` field of the filters. */
  reqRelays(filters: NostrFilter[]): Promise<WebSocket['url'][]>;
  /** Determines the relays to use for publishing the given event. To support the Outbox model, it should analyze the `pubkey` field of the event. */
  eventRelays(event: NostrEvent): Promise<WebSocket['url'][]>;
}

/**
 * The `NPool` class is a `NRelay` implementation for connecting to multiple relays.
 *
 * ```ts
 * const pool = new NPool({
 *   open: (url) => new NRelay1(url),
 *   reqRelays: async (filters) => ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'],
 *   eventRelays: async (event) => ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'],
 * });
 *
 * // Now you can use the pool like a regular relay.
 * for await (const msg of pool.req([{ kinds: [1] }])) {
 *   if (msg[0] === 'EVENT') console.log(msg[2]);
 *   if (msg[0] === 'EOSE') break;
 * }
 * ```
 *
 * This class is designed with the Outbox model in mind.
 * Instead of passing relay URLs into each method, you pass functions into the contructor that statically-analyze filters and events to determine which relays to use for requesting and publishing events.
 * If a relay wasn't already connected, it will be opened automatically.
 * Defining `open` will also let you use any relay implementation, such as `NRelay1`.
 *
 * Note that `pool.req` may stream duplicate events, while `pool.query` will correctly process replaceable events and deletions within the event set before returning them.
 *
 * `pool.req` will only emit an `EOSE` when all relays in its set have emitted an `EOSE`, and likewise for `CLOSED`.
 */
export class NPool implements NRelay {
  private open: (url: WebSocket['url']) => NRelay;
  private reqRelays: (filters: NostrFilter[]) => Promise<WebSocket['url'][]>;
  private eventRelays: (event: NostrEvent) => Promise<WebSocket['url'][]>;

  private relays: Map<WebSocket['url'], NRelay> = new Map();

  constructor({ open, eventRelays, reqRelays }: NPoolOpts) {
    this.open = open;
    this.reqRelays = reqRelays;
    this.eventRelays = eventRelays;
  }

  /** Get or create a relay instance for the given URL. */
  relay(url: WebSocket['url']): NRelay {
    const relay = this.relays.get(url);

    if (relay) {
      return relay;
    } else {
      const relay = this.open(url);
      this.relays.set(url, relay);
      return relay;
    }
  }

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const controller = new AbortController();
    const signal = opts?.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;

    const relayUrls = new Set(await this.reqRelays(filters));
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(signal);

    const eoses = new Set<WebSocket['url']>();
    const closes = new Set<WebSocket['url']>();

    for (const url of relayUrls) {
      const relay = this.relay(url);
      (async () => {
        for await (const msg of relay.req(filters, { signal })) {
          if (msg[0] === 'EOSE') {
            eoses.add(url);
            if (eoses.size === relayUrls.size) {
              machina.push(msg);
            }
          }
          if (msg[0] === 'CLOSED') {
            closes.add(url);
            if (closes.size === relayUrls.size) {
              machina.push(msg);
            }
          }
          if (msg[0] === 'EVENT') {
            machina.push(msg);
          }
        }
      })().catch(() => {});
    }

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      controller.abort();
    }
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const relayUrls = await this.eventRelays(event);

    await Promise.any(
      relayUrls.map((url) => this.relay(url).event(event, opts)),
    );
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const events = new NSet();

    const limit = filters.reduce((result, filter) => result + getFilterLimit(filter), 0);
    if (limit === 0) return [];

    const replaceable = filters.reduce((result, filter) => {
      return result || !!filter.kinds?.some((k) => NKinds.replaceable(k) || NKinds.parameterizedReplaceable(k));
    }, false);

    try {
      for await (const msg of this.req(filters, opts)) {
        if (msg[0] === 'EOSE') break;
        if (msg[0] === 'EVENT') events.add(msg[2]);
        if (msg[0] === 'CLOSED') throw new Error('Subscription closed');

        if (!replaceable && (events.size >= limit)) {
          break;
        }
      }
    } catch (_) {
      // Skip errors, return partial results.
    }

    return [...events];
  }
}
