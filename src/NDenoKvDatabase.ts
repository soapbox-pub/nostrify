import { NStore } from '../interfaces/NStore.ts';
import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NKinds } from './NKinds.ts';

// TODO: implement signal support.
// TODO: try splitting up events to get around 64K Deno KV limit
const HEX64_REGEX = /^[0-9A-Fa-f]{64}$/;

const parseAddrTag = (val: string) => {
  const s = val.split(':');
  if (s.length !== 3) return null;
  const kind = parseInt(val[0]);
  if (isNaN(kind)) return null;
  if (!HEX64_REGEX.test(s[1])) return null;

  return { kind, pkb: s[1], rest: s[2] };
};

const indexTags = (event: NostrEvent) => {
  const keys: Deno.KvKey[] = [];

  event.tags.forEach((tag, i) => {
    // change for multi-character tags
    if (tag.length < 2 || tag[0].length !== 1 || tag[1]?.length === 0 || tag[1]?.length > 100) {
      return; // cant be indexed, forget it
    }
    const firstTag = event.tags.findIndex((t) => t.length >= 2 && t[1] == tag[1]);
    if (firstTag !== i) return; // skip duplicate tags

    let index = 'for-utf8-tags';
    let prefix: (string | number)[] = [tag[1]];

    if (HEX64_REGEX.test(tag[1])) {
      index = 'for-hex64-tags';
    } else if (tag[0] === 'a') {
      index = 'for-address-tags';
      const parsed = parseAddrTag(tag[1]);
      if (!parsed) throw new Error('Invalid tag prefix for tag ' + JSON.stringify(tag));

      prefix = [parsed.pkb, parsed.kind, parsed.rest];
    }

    keys.push(Keys.byTag(event.id, event.created_at, index, ...prefix));
  });

  return keys;
};

const Keys = {
  byPubkey(id: string, timestamp: number, pubkey: string) {
    return ['by-pubkey', pubkey, timestamp, id];
  },
  byKind(id: string, timestamp: number, kind: number) {
    return ['by-kind', kind, timestamp, id];
  },
  byPubkeyAndKind(id: string, timestamp: number, pubkey: string, kind: number) {
    return ['by-pubkey-kind', pubkey, kind, timestamp, id];
  },
  byTimestamp(id: string, timestamp: number) {
    return ['by-timestamp', timestamp, id];
  },
  byTag(id: string, timestamp: number, index: string, ...rest: (number | string)[]) {
    return ['by-tag', index, ...rest, timestamp, id];
  },
};

export class NDenoKvDatabase implements NStore {
  private db: Deno.Kv;

  constructor(db: Deno.Kv) {
    this.db = db;
  }

  async event(event: NostrEvent): Promise<void> {
    // Handle special kinds.
    if (event.kind === 5) {
      // potential slowdown -- because we have the ids but we
      // remove by filter anyway instead of directly
      // .map(removeById)
      const ids = [];
      for (
        const id of event.tags
          .filter((tag) => tag[0] === 'e')
          .map((tag) => tag[1])
      ) {
        const evt = await this.getEvtById(id);
        if (evt && evt.pubkey === event.pubkey) ids.push(id);
      }
      await Promise.all(ids.map(id => this.removeById(id)));
    } else if (NKinds.ephemeral(event.kind)) {
      return;
    } else if (NKinds.replaceable(event.kind)) {
      const existing = await this.resolveFilter({ kinds: [event.kind], authors: [event.pubkey] });
      if (existing.length) {
        const replaced = await this.getEvtById(existing[0]);
        if (replaced && replaced.created_at >= event.created_at) {
          throw new Error('Replacing event cannot be older than the event it replaces.');
        } else this.removeById(existing[0]);
      }
    } else if (NKinds.parameterizedReplaceable(event.kind)) {
      // eliminate this duplication
      const dTagVal = event.tags.find((tag) => tag[0] === 'd')?.[1];
      if (dTagVal) {
        const existing = await this.resolveFilter({ authors: [event.pubkey], kinds: [event.kind], '#d': [dTagVal] });
        if (existing.length) {
          const evt = await this.getEvtById(existing[0]);
          if (evt && evt.created_at >= event.created_at) {
            throw new Error('Replacing event cannot be older than the event it replaces.');
          } else this.removeById(existing[0]);
        }
      }
    }

    const kind5sForEvent = await this.resolveFilter({ kinds: [5], '#e': [event.id] });
    if (kind5sForEvent.length) {
      throw new Error('This event was deleted by a kind 5 event.');
    }

    await Promise.all(indexTags(event).map(async (key) => await this.db.set(key, event.id)));
    const txn = this.db.atomic();
    txn.set(['events', event.id], event)
      .set(Keys.byKind(event.id, event.created_at, event.kind), true)
      .set(Keys.byPubkey(event.id, event.created_at, event.pubkey), true)
      .set(Keys.byPubkeyAndKind(event.id, event.created_at, event.pubkey, event.kind), true)
      .set(Keys.byTimestamp(event.id, event.created_at), true);

    const res = await txn.commit();
    if (!res.ok) {
      throw new Error(`There was an error storing event ${event.id}.`);
    }
  }

  private async resolveFilter(filter: NostrFilter): Promise<string[]> {
    const { ids, authors, kinds, limit, since, until, search: _search, ...rest } = filter;
    const s = since || 0;
    const u = until || Number.MAX_SAFE_INTEGER;

    const tags = [];
    for (const k in rest) {
      if (k.startsWith('#')) {
        const key = k as `#${string}`;
        const tagName = k.slice(1);
        const firstRestValue = rest[key]![0];
        let index = 'for-utf8-tags';
        let prefix: (string | number)[] = [firstRestValue];

        if (HEX64_REGEX.test(firstRestValue)) {
          index = 'for-hex64-tags';
        } else if (tagName === 'a') {
          index = 'for-address-tags';
          const parsed = parseAddrTag(firstRestValue);
          if (!parsed) {
            throw new Error('Error parsing indexed address, this should never happen! File a bug with Ditto devs.');
          }

          prefix = [parsed.pkb, parsed.kind, parsed.rest];
        }

        tags.push({ start: ['by-tag', index, ...prefix, s], end: ['by-tag', index, ...prefix, u] });
      }
    }

    const indices: Set<string> = new Set();
    if (tags.length) {
      for (const range of tags) {
        // TODO: (refactor) for await const here
        //   filter inside
        if (kinds?.length && authors?.length) {
          for await (const entry of this.db.list<string>(range)) {
            if (entry.value) {
              const evt = await this.getEvtById(entry.value);
              if (evt && kinds.includes(evt.kind) && authors.includes(evt.pubkey)) indices.add(entry.value);
            }
          }
        } else if (kinds?.length && !authors?.length) {
          for await (const entry of this.db.list<string>(range)) {
            if (entry.value) {
              const evt = await this.getEvtById(entry.value);
              if (evt && kinds.includes(evt.kind)) indices.add(entry.value);
            }
          }
        } else if (!kinds?.length && authors?.length) {
          for await (const entry of this.db.list<string>(range)) {
            if (entry.value) {
              const evt = await this.getEvtById(entry.value);
              if (evt && authors.includes(evt.pubkey)) indices.add(entry.value);
            }
          }
        } else {
          for await (const entry of this.db.list<string>(range)) {
            if (entry.value) indices.add(entry.value);
          }
        }
      }

      return Array.from(indices).filter(Boolean);
    }

    if (ids?.length) {
      return await Promise.all(
        ids.map(async (itm, i) => {
          if (limit && i > limit - 1) return;
          const evt = await this.getEvtById(itm);
          if (evt && evt.created_at >= s && evt.created_at <= u) return itm;
        }).filter(Boolean) as unknown as string[],
      );
    }

    const selectors: Deno.KvListSelector[] = [];

    if (authors?.length) {
      if (kinds?.length) {
        // TODO: bench this
        authors.forEach((author) =>
          kinds.forEach((kind) =>
            selectors.push({
              start: ['by-pubkey-kind', author, kind, s],
              end: ['by-pubkey-kind', author, kind, u],
            })
          )
        );
      } else {
        authors.forEach((author) =>
          selectors.push({
            start: ['by-pubkey', author, s],
            end: ['by-pubkey', author, u],
          })
        );
      }
    } else if (kinds?.length) {
      kinds.forEach((kind) =>
        selectors.push({
          start: ['by-kind', kind, s],
          end: ['by-kind', kind, u],
        })
      );
    } else {
      selectors.push({ start: ['by-timestamp', s], end: ['by-timestamp', u] });
    }

    let count = 0;
    await Promise.all(selectors.map(async (selector) => {
      for await (const entry of this.db.list<string>(selector)) {
        count += 1;
        if (limit && (count > limit)) {
          return;
        }

        // last part of key is always the id
        indices.add(entry.key.at(-1) as string);
      }
    }));

    return Array.from(indices).filter(Boolean);
  }

  private async resolveFilters(filters: NostrFilter[]): Promise<string[]> {
    const results: string[] = [];
    for (const filter of filters) {
      results.push(...await this.resolveFilter(filter));
    }
    return results;
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const results = (await this.resolveFilters(filters)).filter(Boolean);
    const events: NostrEvent[] = [];
    const CHUNK_SIZE = 10;
    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
      const chunk = (await this.db.getMany<NostrEvent[]>(
        results.slice(i, i + CHUNK_SIZE).map((id) => ['events', id]),
      ))
        .filter((entry) => Boolean(entry.value))
        .map((entry) => entry.value!);
      events.push(...chunk);
    }
    return events;
  }

  async count(filters: NostrFilter[]): Promise<{ count: number; approximate?: boolean | undefined }> {
    const results = await this.resolveFilters(filters);
    return { count: results.length };
  }

  private async removeById(id: string) {
    const evt = await this.getEvtById(id);
    const txn = this.db.atomic();
    if (!evt) throw new Error(`Attempt to remove an event ${id} that did not exist.`);
    indexTags(evt).forEach((k) => txn.delete(k));

    txn.delete(['events', id])
      .delete(Keys.byKind(id, evt.created_at, evt.kind))
      .delete(Keys.byPubkey(evt.id, evt.created_at, evt.pubkey))
      .delete(Keys.byPubkeyAndKind(evt.id, evt.created_at, evt.pubkey, evt.kind))
      .delete(Keys.byTimestamp(evt.id, evt.created_at));

    const res = await txn.commit();
    if (!res.ok) throw new Error('Delete failed!');
  }

  private async getEvtById(id: string): Promise<NostrEvent | null> {
    const evtMaybe = await this.db.get<NostrEvent>(['events', id]);
    if (evtMaybe.value) {
      return evtMaybe.value;
    } else {
      return null;
    }
  }

  async remove(filters: NostrFilter[]): Promise<void> {
    const results = await this.resolveFilters(filters);
    for (const result of results) {
      await this.removeById(result);
    }
  }

  close() {
    this.db.close();
  }
}
