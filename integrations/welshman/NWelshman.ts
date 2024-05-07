import { sortBy, splitAt } from '@welshman/lib';
import { publish, PublishStatus, subscribe, Subscription, SubscriptionEvent } from '@welshman/net';
import {
  decodeAddress,
  Filter,
  getFilterId,
  isContextAddress,
  mergeFilters,
  Router,
  RouterScenario,
} from '@welshman/util';

import { Machina } from '../../src/utils/Machina.ts';
import { NostrEvent } from '../../interfaces/NostrEvent.ts';
import { NostrFilter } from '../../interfaces/NostrFilter.ts';
import { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '../../interfaces/NostrRelayMsg.ts';
import { NRelay } from '../../interfaces/NRelay.ts';

export interface NWelshmanOpts {
  router: Router;
  relayLimit?: number;
  relayRedundancy?: number;
}

export class NWelshman implements NRelay {
  constructor(private opts: NWelshmanOpts) {}

  async event(event: NostrEvent): Promise<void> {
    const relays = this.opts.router.PublishEvent(event).getUrls();

    const { result } = publish({ event, relays });
    const statuses = Array.from((await result).values());

    if (statuses.every((status) => status === PublishStatus.Failure)) {
      throw new Error('Failed to publish event');
    }
  }

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(opts?.signal);
    const subs: Subscription[] = [];

    for (const selection of this.select(filters as Filter[])) {
      const sub = subscribe({
        filters: selection.filters,
        relays: [selection.relay],
      });

      // @ts-ignore Upstream types missing.
      sub.emitter.on(SubscriptionEvent.Event, (url: string, event: NostrEvent) => {
        machina.push(['EVENT', url, event]);
      });

      // @ts-ignore Upstream types missing.
      sub.emitter.on(SubscriptionEvent.Eose, (url: string) => {
        machina.push(['EOSE', url]);
      });

      subs.push(sub);
    }

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      for (const sub of subs) {
        sub.close();
      }
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

  /** Split up filters so they are routed to the best relays. */
  private select(filters: Filter[]): Array<{ relay: string; filters: Filter[] }> {
    const { router, relayLimit = 10, relayRedundancy = 2 } = this.opts;

    const scenarios: RouterScenario[] = [];
    const filtersById = new Map<string, Filter>();

    for (const filter of filters) {
      if (filter.search) {
        const id = getFilterId(filter);

        filtersById.set(id, filter);
        scenarios.push(router.product([id], router.options.getSearchRelays()));
      } else {
        const contexts = filter['#a']?.filter((a) => isContextAddress(decodeAddress(a)));

        if (contexts?.length > 0) {
          for (
            const { relay, values } of router
              .WithinMultipleContexts(contexts)
              .policy(router.addMinimalFallbacks)
              .getSelections()
          ) {
            const contextFilter = { ...filter, '#a': Array.from(values) };
            const id = getFilterId(contextFilter);

            filtersById.set(id, contextFilter);
            scenarios.push(router.product([id], [relay]));
          }
        } else if (filter.authors) {
          for (
            const { relay, values } of router
              .FromPubkeys(filter.authors)
              .policy(router.addMinimalFallbacks)
              .getSelections()
          ) {
            const authorsFilter = { ...filter, authors: Array.from(values) };
            const id = getFilterId(authorsFilter);

            filtersById.set(id, authorsFilter);
            scenarios.push(router.product([id], [relay]));
          }
        } else {
          const id = getFilterId(filter);

          filtersById.set(id, filter);
          scenarios.push(
            router.product([id], router.User().policy(router.addMinimalFallbacks).getUrls()),
          );
        }
      }
    }

    const selections = sortBy(
      ({ filters }) => -filters[0].authors?.length!,
      router
        .merge(scenarios)
        .getSelections()
        .map(({ values, relay }) => ({
          filters: values.map((id: string) => filtersById.get(id) as Filter),
          relay,
        })),
    );

    // Pubkey-based selections can get really big. Use the most popular relays for the long tail.
    const [keep, discard] = splitAt(relayLimit, selections);

    for (const target of keep.slice(0, relayRedundancy)) {
      target.filters = mergeFilters(discard.concat(target).flatMap((s) => s.filters));
    }

    return keep;
  }
}
