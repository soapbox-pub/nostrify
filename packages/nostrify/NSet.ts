import type { NostrEvent } from '@nostrify/types';

/**
 * Nostr event implementation of the `Set` interface.
 *
 * NSet is an implementation of the theory that a Nostr Storage is actually just a Set.
 * Events are Nostr's only data type, and they are immutable, making the Set interface ideal.
 *
 * ```ts
 * const events = new NSet();
 *
 * // Events can be added like a regular `Set`:
 * events.add(event1);
 * events.add(event2);
 *
 * // Can be iterated:
 * for (const event of events) {
 *   if (matchFilters(filters, event)) {
 *     console.log(event);
 *   }
 * }
 * ```
 *
 * `NSet` will handle kind `5` deletions, removing events from the set.
 * Replaceable (and parameterized) events will keep only the newest version.
 * However, verification of `id` and `sig` is NOT performed.
 *
 * Any `Map` instance can be passed into `new NSet()`, making it compatible with
 * [lru-cache](https://www.npmjs.com/package/lru-cache), among others.
 */
class NSet {
  protected cache: Map<string, NostrEvent>;

  constructor(map?: Map<string, NostrEvent>) {
    this.cache = map ?? new Map();
  }

  get size(): number {
    return this.cache.size;
  }

  add(event: NostrEvent): this {
    this.#processDeletions(event);

    for (const e of this) {
      if (NSet.deletes(e, event) || NSet.replaces(e, event)) {
        return this;
      } else if (NSet.replaces(event, e)) {
        this.delete(e);
      }
    }

    this.cache.set(event.id, event);
    return this;
  }

  #processDeletions(event: NostrEvent): void {
    if (event.kind === 5) {
      for (const tag of event.tags) {
        if (tag[0] === 'e') {
          const e = this.cache.get(tag[1]);
          if (e && e.pubkey === event.pubkey) {
            this.delete(e);
          }
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  delete(event: NostrEvent): boolean {
    return this.cache.delete(event.id);
  }

  forEach(
    callbackfn: (event: NostrEvent, key: NostrEvent, set: typeof this) => void,
    thisArg?: any,
  ): void {
    return this.cache.forEach(
      (event, _id) => callbackfn(event, event, this),
      thisArg,
    );
  }

  has(event: NostrEvent): boolean {
    return this.cache.has(event.id);
  }

  *entries(): IterableIterator<[NostrEvent, NostrEvent]> {
    for (const event of this.values()) {
      yield [event, event];
    }
  }

  keys(): IterableIterator<NostrEvent> {
    return this.values();
  }

  *values(): IterableIterator<NostrEvent> {
    for (const event of NSet.sortEvents([...this.cache.values()])) {
      yield event;
    }
  }

  [Symbol.iterator](): IterableIterator<NostrEvent> {
    return this.values();
  }

  [Symbol.toStringTag]: string = 'NSet';

  /** Event kind is **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event is expected to (SHOULD) be stored by relays, older versions are expected to be discarded. */
  protected static isReplaceable(kind: number): boolean {
    return [0, 3].includes(kind) || (10000 <= kind && kind < 20000);
  }

  /** Event kind is **parameterized replaceable**, which means that, for each combination of `pubkey`, `kind` and the `d` tag, only the latest event is expected to be stored by relays, older versions are expected to be discarded. */
  protected static isAddressable(kind: number): boolean {
    return 30000 <= kind && kind < 40000;
  }

  /**
   * Returns true if `event` replaces `target`.
   *
   * Both events must be replaceable, belong to the same kind and pubkey (and `d` tag, for parameterized events), and the `event` must be newer than the `target`.
   */
  protected static replaces(event: NostrEvent, target: NostrEvent): boolean {
    const { kind, pubkey } = event;

    if (NSet.isReplaceable(kind)) {
      return kind === target.kind && pubkey === target.pubkey &&
        NSet.sortEvents([event, target])[0] === event;
    }

    if (NSet.isAddressable(kind)) {
      const d1 = event.tags.find(([name]: string[]) => name === 'd')?.[1] || '';
      const d2 = target.tags.find(([name]: string[]) => name === 'd')?.[1] || '';

      return kind === target.kind &&
        pubkey === target.pubkey &&
        NSet.sortEvents([event, target])[0] === event &&
        d1 === d2;
    }

    return false;
  }

  /**
   * Returns true if the `event` deletes`target`.
   *
   * `event` must be a kind `5` event, and both events must share the same `pubkey`.
   */
  protected static deletes(event: NostrEvent, target: NostrEvent): boolean {
    const { kind, pubkey, tags } = event;
    if (kind === 5 && pubkey === target.pubkey) {
      for (const [name, value] of tags) {
        if (name === 'e' && value === target.id) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Sort events in reverse-chronological order by the `created_at` timestamp,
   * and then by the event `id` (lexicographically) in case of ties.
   * This mutates the array.
   */
  protected static sortEvents(events: NostrEvent[]): NostrEvent[] {
    return events.sort((a: NostrEvent, b: NostrEvent): number => {
      if (a.created_at !== b.created_at) {
        return b.created_at - a.created_at;
      }
      return a.id.localeCompare(b.id);
    });
  }

  union<U>(_other: Set<U>): Set<NostrEvent | U> {
    throw new Error('Method not implemented.');
  }

  intersection<U>(_other: Set<U>): Set<NostrEvent & U> {
    throw new Error('Method not implemented.');
  }

  difference<U>(_other: Set<U>): Set<NostrEvent> {
    throw new Error('Method not implemented.');
  }

  symmetricDifference<U>(_other: Set<U>): Set<NostrEvent | U> {
    throw new Error('Method not implemented.');
  }

  isSubsetOf(_other: Set<unknown>): boolean {
    throw new Error('Method not implemented.');
  }

  isSupersetOf(_other: Set<unknown>): boolean {
    throw new Error('Method not implemented.');
  }

  isDisjointFrom(_other: Set<unknown>): boolean {
    throw new Error('Method not implemented.');
  }
}

export { NSet };
