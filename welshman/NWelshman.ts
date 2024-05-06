import { publish, PublishStatus, subscribe, SubscriptionEvent } from '@welshman/net';
import { Router, RouterScenario } from '@welshman/util';

import { NRelay } from '../interfaces/NRelay.ts';
import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '../interfaces/NostrRelayMsg.ts';
import { Machina } from '../src/utils/Machina.ts';

export class NWelshman implements NRelay {
  constructor(private router: Router) {}

  async event(event: NostrEvent): Promise<void> {
    const relays = this.router.PublishEvent(event).getUrls();

    const { result } = publish({ event, relays });

    const map = await result;

    if ([...map.values()].every((value) => value === PublishStatus.Failure)) {
      throw new Error('Failed to publish event');
    }
  }

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(opts?.signal);
    const scenarios: RouterScenario[] = [];

    for (const filter of filters) {
      if (filter.authors) {
        scenarios.push(this.router.FromPubkeys(filter.authors));
      } else {
        scenarios.push(this.router.ReadRelays());
      }
    }

    const scenario = this.router.merge(scenarios);

    const sub = subscribe({
      // @ts-ignore Filter keys type drama.
      filters: filters,
      relays: scenario.getUrls(),
    });

    // @ts-ignore Upstream types missing.
    sub.emitter.on(SubscriptionEvent.Event, (url: string, event: NostrEvent) => {
      machina.push(['EVENT', url, event]);
    });

    // @ts-ignore Upstream types missing.
    sub.emitter.on(SubscriptionEvent.Eose, (url: string) => {
      machina.push(['EOSE', url]);
    });

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      sub.close();
    }
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
