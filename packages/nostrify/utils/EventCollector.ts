import type { NostrEvent } from '@nostrify/types';

import { NKinds } from '../NKinds.ts';

/**
 * Accumulates events from a subscription, applying the same replaceable-event
 * and deletion semantics as `NSet`, but in constant time per event.
 *
 * `NSet` rescans and re-sorts its entire contents on every `add()`, because it may be
 * backed by a caller-supplied `Map` (such as an LRU cache) that evicts entries without
 * telling it, so it can't safely keep indexes. Query results own their backing map, so
 * the indexes here can't drift and the scan is unnecessary.
 */
export class EventCollector {
  /** Accepted events, keyed by event ID, in the order they were received. */
  readonly #events = new Map<string, NostrEvent>();
  /** Event ID of the current winner for each replaceable/addressable coordinate. */
  readonly #coords = new Map<string, string>();
  /** `pubkey:id` pair -> IDs of the kind `5` events in the set that assert that deletion. */
  readonly #deleted = new Map<string, Set<string>>();

  /** Number of events currently accepted, after replacements and deletions. */
  get size(): number {
    return this.#events.size;
  }

  add(event: NostrEvent): void {
    const { id, kind, pubkey } = event;

    // A kind 5 removes matching events already in the set, even if it is itself rejected.
    if (kind === 5) {
      this.#removeTargets(event);
    }

    if (this.#events.has(id) || this.#deleted.has(`${pubkey}:${id}`)) {
      return;
    }

    const coord = EventCollector.#coord(event);

    if (coord !== undefined) {
      const rivalId = this.#coords.get(coord);
      const rival = rivalId === undefined ? undefined : this.#events.get(rivalId);

      if (rival) {
        if (!EventCollector.#isNewer(event, rival)) return;
        this.#remove(rival);
      }

      this.#coords.set(coord, id);
    }

    this.#events.set(id, event);

    // Asserted only once the kind 5 is in the set, so that a kind 5 whose `e` tag
    // references its own ID doesn't delete itself.
    if (kind === 5) {
      this.#assertDeletions(event);
    }
  }

  /** Events in reverse-chronological order, ties broken by event ID. Matches `NSet` iteration order. */
  toArray(): NostrEvent[] {
    return [...this.#events.values()].sort(EventCollector.#compare);
  }

  /** Events in the order they were received. Matches iterating `NSet`'s backing map directly. */
  toReceivedArray(): NostrEvent[] {
    return [...this.#events.values()];
  }

  /** Remove events targeted by a kind `5`, from the same author. */
  #removeTargets(event: NostrEvent): void {
    for (const [name, value] of event.tags) {
      if (name !== 'e') continue;

      const target = this.#events.get(value);

      if (target && target.pubkey === event.pubkey) {
        this.#remove(target);
      }
    }
  }

  #remove(event: NostrEvent): void {
    this.#events.delete(event.id);

    // Free the coordinate, so a later (older) event of the same coordinate isn't
    // wrongly rejected in favor of an event that is no longer in the set.
    const coord = EventCollector.#coord(event);
    if (coord !== undefined && this.#coords.get(coord) === event.id) {
      this.#coords.delete(coord);
    }

    // A deletion only holds while the kind 5 asserting it is in the set.
    if (event.kind === 5) {
      this.#retractDeletions(event);
    }
  }

  #assertDeletions(event: NostrEvent): void {
    for (const [name, value] of event.tags) {
      if (name !== 'e') continue;

      const key = `${event.pubkey}:${value}`;
      const ids = this.#deleted.get(key);

      if (ids) {
        ids.add(event.id);
      } else {
        this.#deleted.set(key, new Set([event.id]));
      }
    }
  }

  #retractDeletions(event: NostrEvent): void {
    for (const [name, value] of event.tags) {
      if (name !== 'e') continue;

      const key = `${event.pubkey}:${value}`;
      const ids = this.#deleted.get(key);

      if (ids) {
        ids.delete(event.id);
        if (!ids.size) this.#deleted.delete(key);
      }
    }
  }

  /** Replaceable/addressable coordinate of the event, or `undefined` if it is neither. */
  static #coord(event: NostrEvent): string | undefined {
    const { kind, pubkey } = event;

    if (NKinds.replaceable(kind)) {
      return `${kind}:${pubkey}:`;
    }

    if (NKinds.addressable(kind)) {
      const d = event.tags.find(([name]) => name === 'd')?.[1] || '';
      return `${kind}:${pubkey}:${d}`;
    }

    return undefined;
  }

  /** Whether `a` sorts before `b`, ie. `a` is the newer version of a replaceable event. */
  static #isNewer(a: NostrEvent, b: NostrEvent): boolean {
    return EventCollector.#compare(a, b) < 0;
  }

  static #compare(a: NostrEvent, b: NostrEvent): number {
    if (a.created_at !== b.created_at) {
      return b.created_at - a.created_at;
    }
    return a.id.localeCompare(b.id);
  }
}
