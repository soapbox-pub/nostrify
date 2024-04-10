import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '../interfaces/NostrRelayMsg.ts';
import { NRelay } from '../interfaces/NRelay.ts';

interface NPoolOpts {
  open(url: WebSocket['url']): NRelay;
  eventRelays(event: NostrEvent): Promise<WebSocket['url'][]>;
  reqRelays(filters: NostrFilter[]): Promise<WebSocket['url'][]>;
}

export class NPool implements NRelay {
  private open: (url: WebSocket['url']) => NRelay;
  private eventRelays: (event: NostrEvent) => Promise<WebSocket['url'][]>;
  private reqRelays: (filters: NostrFilter[]) => Promise<WebSocket['url'][]>;

  private relays: Map<WebSocket['url'], NRelay> = new Map();

  constructor({ open, eventRelays, reqRelays }: NPoolOpts) {
    this.open = open;
    this.eventRelays = eventRelays;
    this.reqRelays = reqRelays;
  }

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
