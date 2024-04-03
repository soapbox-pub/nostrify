import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NRelay } from '../interfaces/NRelay.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '../mod.ts';

import { NRelay1, NRelay1Opts } from './NRelay1.ts';

interface NPoolOpts extends NRelay1Opts {
  eventRelays(event: NostrEvent): Promise<WebSocket['url'][]>;
  reqRelays(filters: NostrFilter[]): Promise<WebSocket['url'][]>;
}

export class NPool implements NRelay {
  private eventRelays: (event: NostrEvent) => Promise<WebSocket['url'][]>;
  private reqRelays: (filters: NostrFilter[]) => Promise<WebSocket['url'][]>;

  private relayOpts: NRelay1Opts;
  private relays: Map<WebSocket['url'], NRelay1> = new Map();

  constructor({ eventRelays, reqRelays, ...relayOpts }: NPoolOpts) {
    this.eventRelays = eventRelays;
    this.reqRelays = reqRelays;
    this.relayOpts = relayOpts;
  }

  relay(url: WebSocket['url']): NRelay1 {
    const relay = this.relays.get(url);

    if (relay) {
      return relay;
    } else {
      const relay = new NRelay1(url, this.relayOpts);
      this.relays.set(url, relay);
      return relay;
    }
  }

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const relayUrls = await this.reqRelays(filters);

    // FIXME: This implementation is not good.
    for (const url of relayUrls) {
      const relay = this.relay(url);

      for await (const msg of relay.req(filters, opts)) {
        yield msg;
      }
    }
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const relayUrls = await this.eventRelays(event);

    await Promise.all(
      relayUrls.map((url) => this.relay(url).event(event, opts)),
    );
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for await (const msg of this.req(filters, opts)) {
      if (msg[0] === 'EOSE') break;
      if (msg[0] === 'EVENT') events.push(msg[2]);
      if (msg[0] === 'CLOSED') throw new Error('Subscription closed');
    }

    return events;
  }
}
