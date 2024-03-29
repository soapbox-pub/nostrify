// deno-lint-ignore-file no-unused-vars
import { NKinds, NostrEvent, NostrFilter, NStore } from '../mod.ts';
import lmdb from 'npm:lmdb@3.0.0';

export const LmdbKeys = {
  byPubkey(timestamp: number, pubkey: string) {
    return `${pubkey}${timestamp.toString().padStart(19, '0')}`;
  },
  byKind(timestamp: number, kind: number) {
    return `${kind.toString().padStart(5, '0')}${timestamp.toString().padStart(19, '0')}`;
  },
  byPubkeyAndKind(timestamp: number, pubkey: string, kind: number) {
    return `${pubkey}${kind.toString().padStart(5, '0')}${timestamp.toString().padStart(19, '0')}`
  },
  byTimestamp(timestamp: number) {
    return timestamp.toString().padStart(19, '0');
  },
  from(kind: 'pubkey' | 'kind' | 'pubkey-kind' | 'timestamp', key: string) {
    const timestamp = parseInt(key.slice(-19));

    switch (kind) {
      case 'pubkey':
        return { timestamp, pubkey: key.slice(0, 64) }
      case 'pubkey-kind':
        return {
          timestamp,
          kind: parseInt(key.slice(64, -19)),
          pubkey: key.slice(0, 64)
        }
      case 'kind':
        return { timestamp, kind: parseInt(key.slice(0, -19)) }
      default:
        return { timestamp };
    }
  }
}

export class NKvDatabase implements NStore {
  #db: lmdb.Database;

  /**
   * Create a new NKvDatabase, backed by LMDB.
   * @param path The path at which the LMDB database should be stored.
   */
  constructor(path: string) {
    /* Should probably allow passing in a generic "store" so that all this code becomes agnostic of lmdb */
    this.#db = lmdb.open({ path });
  }

  /* todo type this properly */
  #get<T>(key: any) {
    return this.#db.get(key) as T;
  }

  /**
   * Get a list of events by their ids.
   * @param ids A list of event ids.
   * @returns The requested events.
   */
  #getEvents(ids: string[]) {
    return this.#db.getMany(ids.map((id) => ['events', id])) as Promise<NKvDbEventEntry[]>;
  }

  /**
   * Delete a list of events by their ids.
   * @param ids A list of event ids.
   * @returns A promise that resolves when the deletion transaction is complete.
   */
  #deleteEvents(ids: string[]) {
    return this.#db.transaction(() => ids.map((id) => ['events', id]).forEach((key) => this.#db.remove(key)));
  }

  async event(event: NostrEvent) {
    const lastEvt = this.#get<string>('last_event');
    const [lastEvtEntry] = await this.#getEvents([lastEvt]);
    const { id, kind, pubkey } = event;

    lastEvtEntry.next = id;
    if (kind === 5) {
      console.warn('todo: handle kind 5 deletions');
    } else if (NKinds.replaceable(kind)) {
      console.warn('todo: handle replacement');
    } else if (NKinds.parameterizedReplaceable(kind)) {
      console.warn('todo: handle parameterized replacement');
    }

    return this.#db.transaction(async () => {
      await this.#db.put('last_event', id);
      await this.#db.put(['events', id], { next: null, prev: lastEvt, data: event });
      await this.#db.put(['events', lastEvt], lastEvtEntry);
    });
  }

  /**
   * The common logic backing count(), remove() and query().
   * Takes a list of filters and resolves each one, getting the ids of all matching events.
   * @internal
   * @param filters The list of filters
   */
  filtersToIds(filters: NostrFilter[]) {
  }

  query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<NostrEvent[]> {
    throw new Error('Method not implemented.');
  }

  count(filters: NostrFilter[]): Promise<{ count: number; approximate?: boolean | undefined }> {
    throw new Error('Method not implemented.');
  }

  remove(filters: NostrFilter[]): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
