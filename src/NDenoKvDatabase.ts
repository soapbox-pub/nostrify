import { NStore } from '../interfaces/NStore.ts';
import { NostrEvent, NostrFilter } from '../mod.ts';
import { NKinds } from './NKinds.ts';
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";

// TODO: implement signal support.
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
    }
    else if (tag[0] === 'a') {
      index = 'for-address-tags';
      const parsed = parseAddrTag(tag[1]);
      if (!parsed) throw new Error('Invalid tag prefix for tag ' + JSON.stringify(tag));

      prefix = [parsed.pkb, parsed.kind, parsed.rest];
    }

    keys.push(Keys.byTag(event.created_at, index, ...prefix));
  });

  return keys;
}

const Keys = {
  byPubkey(timestamp: number, pubkey: string) {
    return ['by-pubkey', pubkey, timestamp, ulid()];
  },
  byKind(timestamp: number, kind: number) {
    return ['by-kind', kind, timestamp, ulid()];
  },
  byPubkeyAndKind(timestamp: number, pubkey: string, kind: number) {
    return ['by-pubkey-kind', pubkey, kind, timestamp, ulid()];
  },
  byTimestamp(timestamp: number) {
    return ['by-timestamp', timestamp, ulid()];
  },
  byTag(timestamp: number, index: string, ...rest: (number | string)[]) {
    return ['by-tag', index, ...rest, timestamp, ulid()];
  }
}

export class NDenoKvDatabase implements NStore {
  private inited = false;
  private db: Deno.Kv | null = null;
  private path?: string;

  constructor(path?: string) {
    this.path = path;
  }

  async init() {
    if (this.inited) throw new Error('Attempt to initialize already initialised database');
    this.inited = true;
    this.db = await Deno.openKv(this.path);
  }

  async event(event: NostrEvent): Promise<void> {
    if (!this.db) throw new Error('NDenoKvDatabase not initialized before calling event()!');
    if (event.kind === 5) {
      // remove the events it tags if they belong to the sending user
    }
    else if (NKinds.ephemeral(event.kind)) {
      return;
    }
    else if (NKinds.replaceable(event.kind)) {
    }
    else if (NKinds.parameterizedReplaceable(event.kind)) {

    }

    // check if a kind 5 exists for this event. if so, scream

    const txn = this.db.atomic();
    indexTags(event).forEach((key) => txn.set(key, event.id));
    txn.set(['events', event.id], event)
      .set(Keys.byKind(event.created_at, event.kind), event.id)
      .set(Keys.byPubkey(event.created_at, event.pubkey), event.id)
      .set(Keys.byPubkeyAndKind(event.created_at, event.pubkey, event.kind), event.id)
      .set(Keys.byTimestamp(event.created_at), event.id);

    if (!(await txn.commit()).ok) {
      throw new Error(`There was an error storing event ${event.id}.`)
    }
  }
  async resolveFilter(filter: NostrFilter): Promise<string[]> {
    // 0. query based on tags if tags provided. then, filter by kind and author.
    // 1. query based on ids if ids provided.
    // 2. query based on authors if not empty, considering kinds.
    // 3. query based on kinds if not empty and authors empty.
    // 4. query based on timestamp if all empty.
    const { ids, authors, kinds, limit, since, until, search, ...rest } = filter;
    throw new Error('Method not implemented.');
  }
  async resolveFilters(filters: NostrFilter[]): Promise<string[]> {
    const results: string[] = [];
    for (const filter of filters) {
      results.push(...await this.resolveFilter(filter));
    }
    return results;
  }
  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    if (!this.db) throw new Error('NDenoKvDatabase not initialized before calling query()!');
    const results = await this.resolveFilters(filters);
    const events = await this.db.getMany<NostrEvent[]>(results.map(id => ['events', id]));
    return events.map(entry => entry.value).filter(Boolean) as NostrEvent[];
  }
  async count(filters: NostrFilter[]): Promise<{ count: number; approximate?: boolean | undefined; }> {
    if (!this.db) throw new Error('NDenoKvDatabase not initialized before calling count()!');
    const results = await this.resolveFilters(filters);
    return { count: results.length };
  }
  async remove(filters: NostrFilter[]): Promise<void> {
    if (!this.db) throw new Error('NDenoKvDatabase not initialized before calling remove()!');
    const results = await this.resolveFilters(filters);
    throw new Error('Method not implemented.');
  }
}