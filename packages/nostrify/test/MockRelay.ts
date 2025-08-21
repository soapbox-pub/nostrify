// deno-lint-ignore-file require-await

import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/types';
import { matchFilters } from 'nostr-tools';

import { Machina } from '../utils/Machina.ts';
import { NSet } from '../NSet.ts';

/** Mock relay for testing. */
export class MockRelay extends NSet implements NRelay {
  readonly subs: Map<
    string,
    { filters: NostrFilter[]; machina: Machina<NostrEvent> }
  > = new Map();

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const uuid = crypto.randomUUID();
    const machina = new Machina<NostrEvent>(opts?.signal);

    this.subs.set(uuid, { filters, machina });

    try {
      for (const event of await this.query(filters)) {
        yield ['EVENT', uuid, event];
      }

      yield ['EOSE', uuid];

      for await (const event of machina) {
        yield ['EVENT', uuid, event];
      }
    } finally {
      this.subs.delete(uuid);
    }
  }

  async event(event: NostrEvent): Promise<void> {
    this.add(event);

    for (const { filters, machina } of this.subs.values()) {
      if (matchFilters(filters, event)) {
        machina.push(event);
      }
    }
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for (const event of this) {
      if (matchFilters(filters, event)) {
        this.cache.get(event.id);
        events.push(event);
      }
    }

    return events;
  }

  async remove(filters: NostrFilter[]): Promise<void> {
    for (const event of this) {
      if (matchFilters(filters, event)) {
        this.delete(event);
      }
    }
  }

  async count(filters: NostrFilter[]): Promise<NostrRelayCOUNT[2]> {
    const events = await this.query(filters);
    return {
      count: events.length,
      approximate: false,
    };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  override [Symbol.toStringTag] = 'MockRelay';
}
