import { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/nostrify';
import { Machina } from '@nostrify/nostrify/utils';
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

/** Options for the NWelshman class. */
export interface NWelshmanOpts {
  relayLimit?: number;
  relayRedundancy?: number;
}

/**
 * NWelshman is a relay pool using the [Welshman](https://github.com/coracle-social/welshman) library by [Coracle](https://coracle.social/).
 *
 * It accepts a Welshman `Router` object which is used to intelligently route requests to the best relays.
 * This enables outbox support and more.
 */
export class NWelshman implements NRelay {
  constructor(
    /** Welshman Router object to determine which relays to use for each request. */
    private router: Router,
    /** Additional options for the Welshman relay pool. */
    private opts: NWelshmanOpts = {},
  ) {}

  async event(event: NostrEvent): Promise<void> {
    const relays = this.router.PublishEvent(event).getUrls();

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
    const eoses = new Set<WebSocket['url']>();
    const selections = this.select(filters as Filter[]);

    if (!selections.length) {
      machina.push(['EOSE', '']);
      return;
    }

    for (const selection of selections) {
      const sub = subscribe({
        filters: selection.filters,
        relays: [selection.relay],
      });

      subs.push(sub);

      // @ts-ignore Upstream types missing.
      sub.emitter.on(SubscriptionEvent.Event, (url: string, event: NostrEvent) => {
        machina.push(['EVENT', url, event]);
      });

      // @ts-ignore Upstream types missing.
      sub.emitter.on(SubscriptionEvent.Eose, (url: string) => {
        eoses.add(url);
        if (eoses.size === subs.length) {
          machina.push(['EOSE', url]);
        }
      });
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
    const router = this.router;
    const { relayLimit = 10, relayRedundancy = 2 } = this.opts;

    const scenarios: RouterScenario[] = [];
    const filtersById = new Map<string, Filter>();

    for (const filter of filters) {
      if (filter.search) {
        const id = getFilterId(filter);

        filtersById.set(id, filter);
        scenarios.push(router.product([id], router.options.getSearchRelays()));

        continue;
      }

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

    const selections = sortBy(
      ({ filters }) => -filters[0].authors?.length!,
      router
        .merge(scenarios)
        .getSelections()
        .map(({ values, relay }) => ({
          filters: values.map((id) => filtersById.get(id)!),
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

  close(): Promise<void> {
    // TODO: Can we close the subscriptions?
    return Promise.resolve();
  }
}
