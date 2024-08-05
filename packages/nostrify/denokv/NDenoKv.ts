import { NostrEvent, NostrFilter, NStore } from '@nostrify/types';

import { NKinds } from '../NKinds.ts';

const Keys = {
  events(id: string): Deno.KvKey {
    return ['nostr', 'events', id];
  },
  byPubkey(id: string, timestamp: number, pubkey: string): Deno.KvKey {
    return ['nostr', 'by-pubkey', pubkey, timestamp, id];
  },
  byKind(id: string, timestamp: number, kind: number): Deno.KvKey {
    return ['nostr', 'by-kind', kind, timestamp, id];
  },
  byPubkeyAndKind(id: string, timestamp: number, pubkey: string, kind: number): Deno.KvKey {
    return ['nostr', 'by-pubkey-kind', pubkey, kind, timestamp, id];
  },
  byTimestamp(id: string, timestamp: number): Deno.KvKey {
    return ['nostr', 'by-timestamp', timestamp, id];
  },
  byTag(id: string, timestamp: number, index: string, ...rest: (number | string)[]): Deno.KvKey {
    return ['nostr', 'by-tag', index, ...rest, timestamp, id];
  },
};

export class NDenoKv implements NStore {
  private db: Deno.Kv;

  constructor(db: Deno.Kv) {
    this.db = db;
  }

  private static HEX64_REGEX = /^[0-9A-Fa-f]{64}$/;

  async event(event: NostrEvent): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    if (await this.isDeleted(event)) {
      throw new Error('Cannot add a deleted event');
    }

    await Promise.all([
      this.deleteEvents(event),
      this.replaceEvents(event),
    ]);

    await Promise.all(
      NDenoKv.insertTags(event).map((key) => this.db.set(key, event.id)),
    );

    const txn = this.db.atomic();

    txn.set(Keys.events(event.id), event)
      .set(Keys.byKind(event.id, event.created_at, event.kind), true)
      .set(Keys.byPubkey(event.id, event.created_at, event.pubkey), true)
      .set(Keys.byPubkeyAndKind(event.id, event.created_at, event.pubkey, event.kind), true)
      .set(Keys.byTimestamp(event.id, event.created_at), true);

    const res = await txn.commit();

    if (!res.ok) {
      throw new Error(`There was an error storing event ${event.id}.`);
    }
  }

  /** Check if an event has been deleted. */
  protected async isDeleted(event: NostrEvent): Promise<boolean> {
    const ids = await this.resolveFilter({
      kinds: [5],
      authors: [event.pubkey],
      '#e': [event.id],
      limit: 1,
    });
    return ids.length > 0;
  }

  /** Delete events referenced by kind 5. */
  protected async deleteEvents(event: NostrEvent): Promise<void> {
    if (event.kind !== 5) return;

    for (const [name, value] of event.tags) {
      if (name === 'e') {
        const target = await this.getEvtById(value);
        if (target?.pubkey === event.pubkey) {
          await this.removeById(value);
        }
      }
    }
  }

  /** Replace events in NIP-01 replaceable ranges with the same kind and pubkey. */
  protected async replaceEvents(event: NostrEvent): Promise<void> {
    if (NKinds.replaceable(event.kind)) {
      await this.deleteReplaced(
        event,
        { kinds: [event.kind], authors: [event.pubkey] },
        (event, prevEvent) => event.created_at > prevEvent.created_at,
        'Cannot replace an event with an older event',
      );
    }

    if (NKinds.parameterizedReplaceable(event.kind)) {
      const d = event.tags.find(([tag]) => tag === 'd')?.[1];
      if (d) {
        await this.deleteReplaced(
          event,
          { kinds: [event.kind], authors: [event.pubkey], '#d': [d] },
          (event, prevEvent) => event.created_at > prevEvent.created_at,
          'Cannot replace an event with an older event',
        );
      }
    }
  }

  /** Delete events that are replaced by the new event. */
  protected async deleteReplaced(
    event: NostrEvent,
    filter: NostrFilter,
    replaces: (event: NostrEvent, prevEvent: NostrEvent) => boolean,
    error: string,
  ): Promise<void> {
    const prevIds = await this.resolveFilter(filter);

    for (const id of prevIds) {
      const prevEvent = await this.getEvtById(id);

      if (prevEvent && !replaces(event, prevEvent)) {
        throw new Error(error);
      }

      await this.removeById(id);
    }
  }

  private static insertTags(event: NostrEvent): Deno.KvKey[] {
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

      if (NDenoKv.HEX64_REGEX.test(tag[1])) {
        index = 'for-hex64-tags';
      } else if (tag[0] === 'a') {
        index = 'for-address-tags';
        const parsed = NDenoKv.parseAddrTag(tag[1]);
        if (!parsed) throw new Error('Invalid tag prefix for tag ' + JSON.stringify(tag));

        prefix = [parsed.pkb, parsed.kind, parsed.rest];
      }

      keys.push(Keys.byTag(event.id, event.created_at, index, ...prefix));
    });

    return keys;
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

        if (NDenoKv.HEX64_REGEX.test(firstRestValue)) {
          index = 'for-hex64-tags';
        } else if (tagName === 'a') {
          index = 'for-address-tags';
          const parsed = NDenoKv.parseAddrTag(firstRestValue);
          if (!parsed) {
            throw new Error('Error parsing indexed address, this should never happen! File a bug with Ditto devs.');
          }

          prefix = [parsed.pkb, parsed.kind, parsed.rest];
        }

        tags.push({
          start: ['nostr', 'by-tag', index, ...prefix, s],
          end: ['nostr', 'by-tag', index, ...prefix, u],
        });
      }
    }

    const indices: Set<string> = new Set();
    if (tags.length) {
      for (const range of tags) {
        for await (const entry of this.db.list<string>(range)) {
          if (entry.value) {
            const evt = await this.getEvtById(entry.value);
            if (kinds?.length && authors?.length) {
              if (evt && kinds.includes(evt.kind) && authors.includes(evt.pubkey)) indices.add(entry.value);
            } else if (kinds?.length && !authors?.length) {
              if (evt && kinds.includes(evt.kind)) indices.add(entry.value);
            } else if (!kinds?.length && authors?.length) {
              if (evt && authors.includes(evt.pubkey)) indices.add(entry.value);
            } else {
              if (entry.value) indices.add(entry.value);
            }
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
        authors.forEach((author) =>
          kinds.forEach((kind) =>
            selectors.push({
              start: ['nostr', 'by-pubkey-kind', author, kind, s],
              end: ['nostr', 'by-pubkey-kind', author, kind, u],
            })
          )
        );
      } else {
        authors.forEach((author) =>
          selectors.push({
            start: ['nostr', 'by-pubkey', author, s],
            end: ['nostr', 'by-pubkey', author, u],
          })
        );
      }
    } else if (kinds?.length) {
      kinds.forEach((kind) =>
        selectors.push({
          start: ['nostr', 'by-kind', kind, s],
          end: ['nostr', 'by-kind', kind, u],
        })
      );
    } else {
      selectors.push({ start: ['nostr', 'by-timestamp', s], end: ['nostr', 'by-timestamp', u] });
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
        results.slice(i, i + CHUNK_SIZE).map((id) => Keys.events(id)),
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

  private async removeById(id: string): Promise<void> {
    const evt = await this.getEvtById(id);
    const txn = this.db.atomic();
    if (!evt) throw new Error(`Attempt to remove an event ${id} that did not exist.`);
    NDenoKv.insertTags(evt).forEach((k) => txn.delete(k));

    txn.delete(Keys.events(id))
      .delete(Keys.byKind(id, evt.created_at, evt.kind))
      .delete(Keys.byPubkey(evt.id, evt.created_at, evt.pubkey))
      .delete(Keys.byPubkeyAndKind(evt.id, evt.created_at, evt.pubkey, evt.kind))
      .delete(Keys.byTimestamp(evt.id, evt.created_at));

    const res = await txn.commit();
    if (!res.ok) throw new Error('Delete failed!');
  }

  private async getEvtById(id: string): Promise<NostrEvent | null> {
    const evtMaybe = await this.db.get<NostrEvent>(Keys.events(id));
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

  private static parseAddrTag(value: string): { kind: number; pkb: string; rest: string } | undefined {
    const s = value.split(':');
    if (s.length !== 3) return;

    const kind = parseInt(value[0]);

    if (isNaN(kind)) return;
    if (!NDenoKv.HEX64_REGEX.test(s[1])) return;

    return { kind, pkb: s[1], rest: s[2] };
  }
}
