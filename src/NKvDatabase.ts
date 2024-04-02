import { Stickynotes } from 'https://gitlab.com/soapbox-pub/stickynotes/-/raw/v0.2.0/mod.ts';
import lmdb from 'npm:lmdb@3.0.3';
import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NStore } from '../interfaces/NStore.ts';
import { NKinds } from './NKinds.ts';

type ParseableKey = 'pubkey' | 'kind' | 'pubkey-kind' | 'timestamp';
export const LmdbKeys = {
  byPubkey(timestamp: number, pubkey: string) {
    return `${pubkey}${timestamp.toString().padStart(19, '0')}`;
  },
  byKind(timestamp: number, kind: number) {
    return `${kind.toString().padStart(5, '0')}${timestamp.toString().padStart(19, '0')}`;
  },
  byPubkeyAndKind(timestamp: number, pubkey: string, kind: number) {
    return `${pubkey}${kind.toString().padStart(5, '0')}${timestamp.toString().padStart(19, '0')}`;
  },
  byTimestamp(timestamp: number) {
    return timestamp.toString().padStart(19, '0');
  },
  forTag(prefix: string, timestamp: number) {
    return `${prefix}${timestamp.toString().padStart(19, '0')}`;
  },
  from(kind: ParseableKey, key: string) {
    const timestamp = parseInt(key.slice(-19));

    switch (kind) {
      case 'pubkey':
        return { timestamp, pubkey: key.slice(0, 64) };
      case 'pubkey-kind':
        return {
          timestamp,
          kind: parseInt(key.slice(64, -19)),
          pubkey: key.slice(0, 64),
        };
      case 'kind':
        return { timestamp, kind: parseInt(key.slice(0, -19)) };
      default:
        return { timestamp };
    }
  },
};

type NDbIndexType = 'root' | 'pubkeyIndex' | 'kindIndex' | 'pubkeyKindIndex' | 'timeIndex' | 'tagsAddrIndex' | 'tags32Index' | 'tagsIndex';
const HEX64_REGEX = /^[0-9A-Fa-f]{64}$/;

const parseAddrTag = (val: string) => {
  const s = val.split(':');
  if (s.length !== 3) return null;
  const kind = parseInt(val[0]);
  if (isNaN(kind)) return null;
  if (!HEX64_REGEX.test(s[1])) return null;

  return { kind, pkb: s[1], rest: s[2] };
};

interface NKvIndexKeys {
  pubkeyIndex: string,
  kindIndex: string,
  pubkeyKindIndex: string,
  timeIndex: string,
};

const getIndexKeysForEvent = (event: NostrEvent): NKvIndexKeys => {
  return {
    pubkeyIndex: LmdbKeys.byPubkey(event.created_at, event.pubkey),
    kindIndex: LmdbKeys.byKind(event.created_at, event.kind),
    pubkeyKindIndex: LmdbKeys.byPubkeyAndKind(event.created_at, event.pubkey, event.kind),
    timeIndex: LmdbKeys.byTimestamp(event.created_at),
  }
}

const indexTags = (event: NostrEvent, idx: number) => {
  const tagPuts: { index: NDbIndexType, key: lmdb.Key, idx: number }[] = [];

  event.tags.forEach((tag, i) => {
    // change for multi-character tags
    if (tag.length < 2 || tag[0].length !== 1 || tag[1]?.length === 0 || tag[1]?.length > 100) {
      return; // cant be indexed, forget it
    }
    const firstTag = event.tags.findIndex((t) => t.length >= 2 && t[1] == tag[1]);
    if (firstTag !== i) return; // skip duplicate tags

    if (tag[0] === 'a') {
      const parsed = parseAddrTag(tag[1]);
      if (!parsed) throw new Error('Invalid tag prefix for tag ' + JSON.stringify(tag));
      tagPuts.push({ index: 'tagsAddrIndex', key: LmdbKeys.forTag(addrPrefix(parsed), event.created_at), idx });
    } else if (HEX64_REGEX.test(tag[1])) {
      tagPuts.push({ index: 'tags32Index', key: LmdbKeys.forTag(tag[1], event.created_at), idx });
    }
    else {
      tagPuts.push({ index: 'tagsIndex', key: LmdbKeys.forTag(tag[1], event.created_at), idx });
    }
  })

  return tagPuts;
}

const addrPrefix = (parsed: { pkb: string, kind: number, rest: string }) => parsed.pkb + parsed.kind.toString().padStart(5, '0') + parsed.rest;

export class NKvDatabase implements NStore {
  private dbs: Record<NDbIndexType, lmdb.Database>;
  private console = new Stickynotes('NKvDatabase');

  /**
   * Create a new NKvDatabase, backed by LMDB.
   * @param path The path at which the LMDB database should be stored.
   */
  constructor(path: string) {
    const db = lmdb.open({ path });
    this.dbs = {
      root: db,
      kindIndex: db.openDB({ name: 'kindIndex', dupSort: true, encoding: 'ordered-binary' }),
      pubkeyIndex: db.openDB({ name: 'pubkeyIndex', dupSort: true, encoding: 'ordered-binary' }),
      pubkeyKindIndex: db.openDB({ name: 'pubkeyKindIndex', dupSort: true, encoding: 'ordered-binary' }),
      timeIndex: db.openDB({ name: 'timeIndex', dupSort: true, encoding: 'ordered-binary' }),
      tagsIndex: db.openDB({ name: 'tagsIndex', dupSort: true, encoding: 'ordered-binary' }),
      tags32Index: db.openDB({ name: 'tags32Index', dupSort: true, encoding: 'ordered-binary' }),
      tagsAddrIndex: db.openDB({ name: 'tagsAddrIndex', dupSort: true, encoding: 'ordered-binary' }),
    };
  }

  /* todo type this properly */
  private get<T>(from: NDbIndexType, key: any) {
    return this.dbs[from].get(key) as T;
  }

  async event(event: NostrEvent) {
    this.console.debug('event', event.id);

    const lastIdx = this.get<number>('root', 'last_event') || -1;
    const idx = lastIdx + 1;

    if (event.kind === 5) {
      this.remove([{
        ids: event.tags
          .filter(tag => tag[0] === 'e')
          .map(tag => tag[1])
          .filter(id => {
            const evt = this.dbs.root.get(id);
            return (evt && evt.pubkey === event.pubkey);
          })
      }]);
    }
    else if (NKinds.replaceable(event.kind)) {
      const existing = this.resolveFilter({ kinds: [event.kind], authors: [event.pubkey] });
      if (existing.length) {
        const evt = this.dbs.root.get(existing[0]);
        if (evt.created_at >= event.created_at) {
          return Promise.reject(new Error("Replacing event cannot be older than the event it replaces."));
        }
        else {
          this.removeByIdx(existing[0]);
        }
      }
    }
    else if (NKinds.parameterizedReplaceable(event.kind)) {
      const dTagVal = event.tags.find(tag => tag[0] === 'd')?.[1];
      if (dTagVal) {
        const existing = this.resolveFilter({ authors: [event.pubkey], kinds: [event.kind], "#d": [dTagVal] });
        if (existing.length) {
          const evt = this.dbs.root.get(existing[0]);
          if (evt.created_at >= event.created_at) {
            return Promise.reject(new Error("Replacing event cannot be older than the event it replaces."));
          }
          else {
            this.removeByIdx(existing[0]);
          }
        }
      }
    }

    const doesKind5Exist = this.resolveFilter({ kinds: [5], '#e': [event.id] });
    if (doesKind5Exist.length) {
      throw new Error('This event was deleted by a kind 5 event.');
    }

    this.dbs.root.transactionSync(() => {
      this.dbs.root.put('last_event', idx);
      this.dbs.root.put(idx, event);
      this.dbs.root.put(event.id, idx);
      indexTags(event, idx).forEach((put) => this.dbs[put.index].put(put.key, put.idx));

      const keys = getIndexKeysForEvent(event);
      const indices: (keyof NKvIndexKeys)[] = ['pubkeyIndex', 'kindIndex', 'pubkeyKindIndex', 'timeIndex'];
      indices.forEach(index => this.dbs[index].put(keys[index], idx));
    });

    await this.dbs.root.flushed;
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
      if (k.startsWith('#')) {
        const key = k as `#${string}`;
        const tagName = k.slice(1);
        const firstRestValue = rest[key]![0];
        let start = LmdbKeys.forTag(firstRestValue, s);
        let end = LmdbKeys.forTag(firstRestValue, u);
        let index: NDbIndexType = 'tagsIndex';

        if (tagName === 'a' && rest[key] && rest[key]?.length) {
          const parsed = parseAddrTag(firstRestValue);
          if (!parsed) throw new Error('Error parsing address tag.');
          start = LmdbKeys.forTag(addrPrefix(parsed), s);
          end = LmdbKeys.forTag(addrPrefix(parsed), u);
          index = 'tagsAddrIndex';
        }
        else if (HEX64_REGEX.test(firstRestValue)) {
          index = 'tags32Index';
        }

        tags.push({ index, start, end });
      }
    }

    const indices: number[] = [];

    if (tags.length) {
      tags.forEach(({ start, index, end }) =>
        this.dbs[index]
          .getRange({ start, end })
          .forEach(entry => {
            if (!(kinds?.length) && !(authors?.length)) {
              indices.push(entry.value);
              return;
            }
            const evt = this.dbs.root.get(entry.value);
            if (kinds?.length && !kinds.includes(evt.kind)) return;
            if (authors?.length && !authors.includes(evt.author)) return;
            indices.push(entry.value);
          })
      )

      return indices;
      // return Array.from(new Set(indices));
    }

    if (ids?.length) {
      const gotten = ids.map((id) => this.dbs.root.get(id));
      indices.push(...gotten);
    } else if (authors?.length) {
      const isPubkeyKind = !!(kinds?.length);
      const ranges = isPubkeyKind
        ? authors.map(
          (author) =>
            kinds.map((kind) => ({
              start: LmdbKeys.byPubkeyAndKind(s, author, kind),
              end: LmdbKeys.byPubkeyAndKind(u, author, kind),
            })),
        ).flat()
        : authors.map((author) => ({
          start: LmdbKeys.byPubkey(s, author),
          end: LmdbKeys.byPubkey(u, author),
        }));

      for (const range of ranges) {
        this.dbs[isPubkeyKind ? 'pubkeyKindIndex' : 'pubkeyIndex']
          .getRange(range)
          .forEach((itm) => indices.push(itm.value));
      }
    } else if (kinds?.length) {
      const ranges = kinds.map((kind) => ({ start: LmdbKeys.byKind(s, kind), end: LmdbKeys.byKind(u, kind) }));
      for (const range of ranges) {
        this.dbs.kindIndex.getRange(range)
          .forEach((itm) => indices.push(itm.value));
      }
    } else {
      this.dbs.timeIndex
        .getRange({ start: LmdbKeys.byTimestamp(s), end: LmdbKeys.byTimestamp(u) })
        .forEach((v) => indices.push(v.value));
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
    return filters.map((filter) => this.resolveFilter(filter)).flat();
  }

  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}) {
    const indices = this.resolveFilters(filters).slice(0, opts.limit);
    /*
    return await this.dbs.root.getMany(indices);
    /*/
    return Promise.resolve(indices.map(index => this.dbs.root.get(index)));
    //*/
  }

  count(filters: NostrFilter[]): Promise<{ count: number; approximate?: boolean | undefined }> {
    const indices = this.resolveFilters(filters);
    return Promise.resolve({ count: indices.length });
  }

  removeByIdx(idx: number) {
    const body = this.dbs.root.get(idx);
    return new Promise<void>((resolve) => {
      this.dbs.root.transactionSync(() => {
        indexTags(body, idx).forEach((put) => this.dbs[put.index].remove(put.key));
        const keys = getIndexKeysForEvent(body);
        const indices: (keyof NKvIndexKeys)[] = ['pubkeyIndex', 'kindIndex', 'pubkeyKindIndex', 'timeIndex'];
        indices.forEach(index => this.dbs[index].remove(keys[index]));
        this.dbs.root.remove(idx);
        this.dbs.root.remove(body.id);

        resolve();
      })
    })
  }

  remove(filters: NostrFilter[]): Promise<void> {
    const indices = this.resolveFilters(filters);
    return Promise.resolve(indices.forEach(idx => this.removeByIdx(idx)));
  }
}
