import { NostrEvent, NostrFilter, NStore } from '../mod.ts';
import lmdb from 'npm:lmdb@3.0.3';

type ParseableKey = 'pubkey' | 'kind' | 'pubkey-kind' | 'timestamp';
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
  forTag(prefix: string, timestamp: number) {
    return `${prefix}${timestamp.toString().padStart(19)}`;
  },
  from(kind: ParseableKey, key: string) {
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

type NDbIndexType = 'root' | 'idIndex' | 'pubkeyIndex' | 'kindIndex' | 'pubkeyKindIndex' | 'timeIndex' | 'tagsIndex';
const HEX32_REGEX = /^[0-9A-Fa-f]{64}$/;

const parseAddrTag = (val: string) => {
  const s = val.split(':');
  if (s.length !== 3) return null;
  const kind = parseInt(val[0]);
  if (isNaN(kind)) return null;
  if (!HEX32_REGEX.test(s[1])) return null;

  return { kind, pkb: s[1], rest: s[2] };
}

export class NKvDatabase implements NStore {
  dbs: Record<NDbIndexType, lmdb.Database>

  /**
   * Create a new NKvDatabase, backed by LMDB.
   * @param path The path at which the LMDB database should be stored.
   */
  constructor(path: string) {
    const db = lmdb.open({ path });
    this.dbs = {
      root: db,
      idIndex: db.openDB({ name: 'idIndex', dupSort: true, encoding: 'ordered-binary' }),
      kindIndex: db.openDB({ name: 'kindIndex', dupSort: true, encoding: 'ordered-binary' }),
      pubkeyIndex: db.openDB({ name: 'pubkeyIndex', dupSort: true, encoding: 'ordered-binary' }),
      pubkeyKindIndex: db.openDB({ name: 'pubkeyKindIndex', dupSort: true, encoding: 'ordered-binary' }),
      timeIndex: db.openDB({ name: 'timeIndex', dupSort: true, encoding: 'ordered-binary' }),
      tagsIndex: db.openDB({ name: 'tagsIndex', dupSort: true, encoding: 'ordered-binary' })
    };
  }

  /* todo type this properly */
  #get<T>(from: NDbIndexType, key: any) {
    return this.dbs[from].get(key) as T;
  }

  event(event: NostrEvent) {
    const lastIdx = this.#get<number>('root', 'last_event') || -1;
    const idx = lastIdx + 1;
    const tagPuts: [lmdb.Key, any][] = [];

    event.tags.forEach((tag, i) => {
      if (tag.length < 2 || tag[0].length !== 1 || tag[1]?.length === 0 || tag[1]?.length > 100) {
        return; // cant be indexed, forget it
      }
      const firstTag = 1 || event.tags.findIndex((t) => t.length >= 2 && t[1] == tag[1]);
      if (firstTag !== i) return; // skip duplicate tags

      if (tag[0] === 'a') {
        const parsed = parseAddrTag(tag[1]);
        if (!parsed) throw new Error("Invalid tag prefix for tag " + JSON.stringify(tag));
        const prefix = parsed.pkb + parsed.kind.toString().padStart(5, '0') + parsed.rest;
        tagPuts.push([LmdbKeys.forTag(prefix, event.created_at), idx]);
      }
      else {
        tagPuts.push([LmdbKeys.forTag(tag[1], event.created_at), idx]);
      }
    });

    return Promise.resolve(this.dbs.root.transactionSync(() => {
      this.dbs.root.put('last_event', idx);
      this.dbs.root.put(idx, event);
      this.dbs.root.put(event.id, idx);
      tagPuts.map(put => this.dbs.tagsIndex.put(put[0], put[1]));
      this.dbs.pubkeyIndex.put(LmdbKeys.byPubkey(event.created_at, event.pubkey), idx);
      this.dbs.kindIndex.put(LmdbKeys.byKind(event.created_at, event.kind), idx);
      this.dbs.pubkeyKindIndex.put(LmdbKeys.byPubkeyAndKind(event.created_at, event.pubkey, event.kind), idx);
      this.dbs.timeIndex.put(LmdbKeys.byTimestamp(event.created_at), idx);
    }));
  }

  resolveFilter(filter: NostrFilter) {
    // Steps:
    // 1. Create queries based on IDs if not empty.
    // 2. Create queries based on authors if not empty, considering kinds.
    // 3. Create queries based on tags if not empty, determining array size by tag sizes.
    // 4. Create queries based on kinds if not empty.
    // 5. Create a default query based on creation timestamp if none of the above conditions are met.

    const { ids, authors, kinds, limit, since, until, search, ...rest } = filter;
    if (search) throw new Error("Search isn't implemented for NKvDatabase yet.");

    const s = since ?? 0;
    const u = until ?? Number.MAX_SAFE_INTEGER;

    const tags = [];
    for (const k in rest) {
      if (k.startsWith('#')) tags.push([k.slice(1), rest[k as any]]);
      console.log('test');
    }

    const indices: number[] = [];

    if (ids?.length) {
      const gotten = ids.map(id => this.dbs.root.get(id));
      indices.push(...gotten);
    }
    else if (authors?.length) {
      const isPubkeyKind = !!(kinds?.length);
      const ranges = isPubkeyKind ? authors.map(
        author => kinds.map(kind => ({
          start: LmdbKeys.byPubkeyAndKind(s, author, kind),
          end: LmdbKeys.byPubkeyAndKind(u, author, kind)
        }))).flat()
        : authors.map(author => ({
          start: LmdbKeys.byPubkey(s, author),
          end: LmdbKeys.byPubkey(u, author)
        }));

      for (const range of ranges) {
        this.dbs[isPubkeyKind ? 'pubkeyKindIndex' : 'pubkeyIndex']
          .getRange(range)
          .forEach(itm => indices.push(itm.value));
      }
    }
    else if (kinds?.length) {
      const ranges = kinds.map(kind => ({ start: LmdbKeys.byKind(s, kind), end: LmdbKeys.byKind(u, kind) }));
      for (const range of ranges) {
        this.dbs.kindIndex.getRange(range)
          .forEach(itm => indices.push(itm.value));
      }
    }
    else {
      this.dbs.timeIndex
        .getRange({ start: LmdbKeys.byTimestamp(s), end: LmdbKeys.byTimestamp(u) })
        .forEach(v => indices.push(v.value));
    }

    const results = Array.from(new Set(indices));
    return typeof limit === 'number' ? results.slice(0, limit + 1) : results;
  }

  /**
   * The common logic backing count(), remove() and query().
   * Takes a list of filters and resolves each one, getting the events matching each filter.
   * @internal
   * @param filters The list of filters
   */
  resolveFilters(filters: NostrFilter[]) {
    return filters.map(filter => this.resolveFilter(filter)).flat();
  }

  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}) {
    const indices = this.resolveFilters(filters).slice(0, opts.limit);
    const results: NostrEvent[] = [];
    for (const result of await this.dbs.root.getMany(indices)) {
      results.push(result);
    }
    return results;
  }

  count(filters: NostrFilter[]): Promise<{ count: number; approximate?: boolean | undefined }> {
    const indices = this.resolveFilters(filters);
    return Promise.resolve({ count: indices.length });
  }

  remove(filters: NostrFilter[]): Promise<void> {
    const _ = this.resolveFilters(filters);
    throw new Error('Method not implemented.');
  }
}
