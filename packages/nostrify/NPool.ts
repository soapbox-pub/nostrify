import { NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/types';
import { getFilterLimit, NostrEvent } from 'nostr-tools';

import { Machina } from './utils/Machina.ts';
import { NKinds } from './NKinds.ts';
import { NSet } from './NSet.ts';

export interface NPoolOpts<T extends NRelay> {
  /** Creates an `NRelay` instance for the given URL. */
  open(url: string): T;
  /** Determines the relays to use for making `REQ`s to the given filters. To support the Outbox model, it should analyze the `authors` field of the filters. */
  reqRouter(filters: NostrFilter[]): Promise<ReadonlyMap<string, NostrFilter[]>>;
  /** Determines the relays to use for publishing the given event. To support the Outbox model, it should analyze the `pubkey` field of the event. */
  eventRouter(event: NostrEvent): Promise<string[]>;
}

/**
 * The `NPool` class is a `NRelay` implementation for connecting to multiple relays.
 *
 * ```ts
 * const pool = new NPool({
 *   open: (url) => new NRelay1(url),
 *   reqRouter: async (filters) => new Map([
 *     ['wss://relay1.mostr.pub', filters],
 *     ['wss://relay2.mostr.pub', filters],
 *   ]),
 *   eventRouter: async (event) => ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'],
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
export class NPool<T extends NRelay> implements NRelay {
  private _relays = new Map<string, T>();

  constructor(private opts: NPoolOpts<T>) {}

  /** Get or create a relay instance for the given URL. */
  public relay(url: string): T {
    const relay = this._relays.get(url);

    if (relay) {
      return relay;
    } else {
      const relay = this.opts.open(url);
      this._relays.set(url, relay);
      return relay;
    }
  }

  public get relays(): ReadonlyMap<string, T> {
    return this._relays;
  }

  /**
   * Sends a `REQ` to relays based on the configured `reqRouter`.
   *
   * All `EVENT` messages from the selected relays are yielded, with no deduplication or order.
   * `EOSE` and `CLOSE` messages are only yielded when all relays have emitted them.
   */
  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const controller = new AbortController();
    const signal = opts?.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;

    const routes = await this.opts.reqRouter(filters);

    if (routes.size < 1) {
      return;
    }

    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(signal);

    const eoses = new Set<string>();
    const closes = new Set<string>();

    for (const [url, filters] of routes.entries()) {
      const relay = this.relay(url);
      (async () => {
        for await (const msg of relay.req(filters, { signal })) {
          if (msg[0] === 'EOSE') {
            eoses.add(url);
            if (eoses.size === routes.size) {
              machina.push(msg);
            }
          }
          if (msg[0] === 'CLOSED') {
            closes.add(url);
            if (closes.size === routes.size) {
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

  /**
   * Events are sent to relays according to the `eventRouter`.
   * Returns a fulfilled promise if ANY relay accepted the event,
   * or a rejected promise if ALL relays rejected or failed to publish the event.
   */
  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const relayUrls = await this.opts.eventRouter(event);

    if (relayUrls.length < 1) {
      return;
    }

    await Promise.any(
      relayUrls.map((url) => this.relay(url).event(event, opts)),
    );
  }

  /**
   * This method calls `.req` internally and then post-processes the results.
   * Please read the definition of `.req`.
   *
   * - The strategy is to seek regular events quickly, and to wait to find the latest versions of replaceable events.
   * - Filters for replaceable events will wait for all relays to `EOSE` (or `CLOSE`, or for the signal to be aborted) to ensure the latest event versions are retrieved.
   * - Filters for regular events will stop as soon as the filters are fulfilled.
   * - Events are deduplicated, sorted, and only the latest version of replaceable events is kept.
   * - If the signal is aborted, this method will return partial results instead of throwing.
   *
   * To implement a custom strategy, call `.req` directly.
   */
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
    } catch {
      // Skip errors, return partial results.
    }

    return [...events];
  }

  /** Close all the relays in the pool. */
  async close(): Promise<void> {
    await Promise.all(
      [...this._relays.values()].map((relay) => relay.close()),
    );
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
