import { NostrEvent } from '../interfaces/NostrEvent.ts';

/**
 * Nostr event implementation of the `Set` interface.
 *
 * Adding events with `NSet.add(event: NostrEvent)`:
 *
 * - Events are stored by `id`.
 * - Replaceable events are replaced within the set. Older versions of replaceable events can't be added.
 * - Kind `5` events will delete their targets from the set. Those events can't be added, so long as the deletion event remains in the set.
 *
 * Any `Map` instance can be passed into `new NSet()`, making it compatible with [lru-cache](https://www.npmjs.com/package/lru-cache) and [ttl-cache](https://www.npmjs.com/package/@isaacs/ttlcache), among others.
 *
 * Event validation is NOT performed. Callers MUST verify signatures before adding events to the set.
 */
class NSet implements Set<NostrEvent> {
  protected cache: Map<string, NostrEvent>;

  constructor(map?: Map<string, NostrEvent>) {
    this.cache = map ?? new Map();
  }

  get size() {
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

  forEach(callbackfn: (event: NostrEvent, key: NostrEvent, set: typeof this) => void, thisArg?: any): void {
    return this.cache.forEach((event, _id) => callbackfn(event, event, this), thisArg);
  }

  has(event: NostrEvent): boolean {
    return this.cache.has(event.id);
  }

  *entries(): IterableIterator<[NostrEvent, NostrEvent]> {
    for (const event of this.cache.values()) {
      yield [event, event];
    }
  }

  keys(): IterableIterator<NostrEvent> {
    return this.cache.values();
  }

  values(): IterableIterator<NostrEvent> {
    return this.cache.values();
  }

  [Symbol.iterator](): IterableIterator<NostrEvent> {
    return this.cache.values();
  }

  [Symbol.toStringTag]: string = 'NSet';

  /** Events are **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event is expected to (SHOULD) be stored by relays, older versions are expected to be discarded. */
  protected static isReplaceable({ kind }: NostrEvent) {
    return [0, 3].includes(kind) || (10000 <= kind && kind < 20000);
  }

  /** Events are **parameterized replaceable**, which means that, for each combination of `pubkey`, `kind` and the `d` tag, only the latest event is expected to be stored by relays, older versions are expected to be discarded. */
  protected static isParameterizedReplaceable({ kind }: NostrEvent) {
    return 30000 <= kind && kind < 40000;
  }

  /** Returns true if both events are replaceable, belong to the same kind and pubkey (and `d` tag, for parameterized events), and the first event is newer than the second one. */
  protected static replaces(event: NostrEvent, target: NostrEvent): boolean {
    if (NSet.isReplaceable(event)) {
      return event.kind === target.kind && event.pubkey === target.pubkey && event.created_at > target.created_at;
    } else if (NSet.isParameterizedReplaceable(event)) {
      const d = event.tags.find(([name]) => name === 'd')?.[1] || '';
      const d2 = target.tags.find(([name]) => name === 'd')?.[1] || '';

      return event.kind === target.kind &&
        event.pubkey === target.pubkey &&
        d === d2 &&
        event.created_at > target.created_at;
    }
    return false;
  }

  /** Returns true if the event is a delete event for the target event. */
  protected static deletes(event: NostrEvent, target: NostrEvent): boolean {
    if (event.kind === 5 && event.pubkey === target.pubkey) {
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1] === target.id) {
          return true;
        }
      }
    }
    return false;
  }
}

export { NSet };
