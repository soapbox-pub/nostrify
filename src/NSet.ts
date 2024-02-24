import { NostrEvent } from '../interfaces/NostrEvent.ts';

/**
 * Nostr event implementation of the `Set` interface.
 *
 * NSet is an implementation of the theory that a Nostr Storage is actually just a Set.
 * Events are Nostr's only data type, and they are immutable, making the Set interface ideal.
 *
 * Since the Set interface is synchronous, it can't actually implement `NStore`.
 * But it is possible to implement both `NStore` and `NSet` in a single class (eg `NCache`).
 *
 * Adding events with `NSet.add(event: NostrEvent)`:
 *
 * - Events are stored by `id`.
 * - Replaceable events are replaced within the set. Older versions of replaceable events can't be added.
 * - Kind `5` events will delete their targets from the set. Those events can't be added, so long as the deletion event remains in the set.
 *
 * Any `Map` instance can be passed into `new NSet()`, making it compatible with [lru-cache](https://www.npmjs.com/package/lru-cache), among others.
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

  /** Event kind is **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event is expected to (SHOULD) be stored by relays, older versions are expected to be discarded. */
  protected static isReplaceable(kind: number) {
    return [0, 3].includes(kind) || (10000 <= kind && kind < 20000);
  }

  /** Event kind is **parameterized replaceable**, which means that, for each combination of `pubkey`, `kind` and the `d` tag, only the latest event is expected to be stored by relays, older versions are expected to be discarded. */
  protected static isParameterizedReplaceable(kind: number) {
    return 30000 <= kind && kind < 40000;
  }

  /**
   * Returns true if `event` replaces `target`.
   *
   * Both events must be replaceable, belong to the same kind and pubkey (and `d` tag, for parameterized events), and the `event` must be newer than the `target`.
   */
  protected static replaces(event: NostrEvent, target: NostrEvent): boolean {
    const { kind, pubkey, created_at } = event;

    if (NSet.isReplaceable(kind)) {
      return kind === target.kind && pubkey === target.pubkey && created_at > target.created_at;
    }

    if (NSet.isParameterizedReplaceable(kind)) {
      const d1 = event.tags.find(([name]) => name === 'd')?.[1] || '';
      const d2 = target.tags.find(([name]) => name === 'd')?.[1] || '';
      return kind === target.kind && pubkey === target.pubkey && created_at > target.created_at && d1 === d2;
    }

    return false;
  }

  /**
   * Returns true if the `event` deletes`target`.
   *
   * `event` must be a kind `5` event, and both events must share the same `pubkey`.
   */
  static deletes(event: NostrEvent, target: NostrEvent): boolean {
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
}

export { NSet };
