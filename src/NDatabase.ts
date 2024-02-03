import { Kysely } from 'npm:kysely@^0.27.2';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NStore, NStoreOpts } from '../interfaces/NStore.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = ({ event, count, value }: {
  event: NostrEvent;
  count: number;
  value: string;
}) => boolean;

/** Conditions for when to index certain tags. */
const tagConditions: Record<string, TagCondition> = {
  'd': ({ event, count }) => count === 0 && isParameterizedReplaceableKind(event.kind),
  'e': ({ count, value }) => (count < 15) && isNostrId(value),
  'p': ({ event, count, value }) => (count < 15 || event.kind === 3) && isNostrId(value),
};

interface NDatabaseSchema {
  nostr_events: {
    id: string;
    kind: number;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string;
    sig: string;
  }
  nostr_tags: {
    name: string;
    value: string;
    event_id: string;
  }
  nostr_fts?: {
    event_id: string;
    content: string;
  }
}

interface NDatabaseOpts {
  logger?: Console['log'];
  fts?: boolean;
}

/** SQLite database storage adapter for Nostr events. */
export class NDatabase implements NStore {
  #db: Kysely<NDatabaseSchema>;
  #logger: Console['log'];
  #fts: boolean;

  constructor(db: Kysely<NDatabaseSchema>, opts?: NDatabaseOpts) {
    this.#db = db;
    this.#logger = opts?.logger ?? console.log;
    this.#fts = opts?.fts ?? false;
  }

  /** Insert an event (and its tags) into the database. */
  async event(event: NostrEvent, _opts?: NStoreOpts): Promise<void> {
    return await this.#db.transaction().execute(async (trx) => {
      /** Insert the event into the database. */
      async function addEvent() {
        await trx.insertInto('nostr_events')
          .values({ ...event, tags: JSON.stringify(event.tags) })
          .execute();
      }

      /** Add search data to the FTS table. */
      const indexSearch = async() => {
        if (!this.#fts) return;
        const searchContent = buildSearchContent(event);
        if (!searchContent) return;
        await trx.insertInto('nostr_fts')
          .values({ event_id: event.id, content: searchContent.substring(0, 1000) })
          .execute();
      }

      /** Index event tags depending on the conditions defined above. */
      async function indexTags() {
        const tags = filterIndexableTags(event);
        const rows = tags.map(([name, value]) => ({ event_id: event.id, name, value }));

        if (!tags.length) return;
        await trx.insertInto('nostr_tags')
          .values(rows)
          .execute();
      }

      if (isReplaceableKind(event.kind)) {
        const prevEvents = await this.getFilterQuery(trx, { kinds: [event.kind], authors: [event.pubkey] }).execute();
        for (const prevEvent of prevEvents) {
          if (prevEvent.created_at >= event.created_at) {
            throw new Error('Cannot replace an event with an older event');
          }
        }
        await this.deleteEventsTrx(trx, [{ kinds: [event.kind], authors: [event.pubkey] }]);
      }

      if (isParameterizedReplaceableKind(event.kind)) {
        const d = event.tags.find(([tag]) => tag === 'd')?.[1];
        if (d) {
          const prevEvents = await this.getFilterQuery(trx, { kinds: [event.kind], authors: [event.pubkey], '#d': [d] })
            .execute();
          for (const prevEvent of prevEvents) {
            if (prevEvent.created_at >= event.created_at) {
              throw new Error('Cannot replace an event with an older event');
            }
          }
          await this.deleteEventsTrx(trx, [{ kinds: [event.kind], authors: [event.pubkey], '#d': [d] }]);
        }
      }

      // Run the queries.
      await Promise.all([
        addEvent(),
        indexTags(),
        indexSearch(),
      ]);
    }).catch((error) => {
      // Don't throw for duplicate events.
      if (error.message.includes('UNIQUE constraint failed')) {
        return;
      } else {
        throw error;
      }
    });
  }

  /** Build the query for a filter. */
  getFilterQuery(db: Kysely<NDatabaseSchema>, filter: NostrFilter) {
    let query = db
      .selectFrom('nostr_events')
      .selectAll()
      .orderBy('created_at', 'desc');

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;

      switch (key as keyof NostrFilter) {
        case 'ids':
          query = query.where('id', 'in', filter.ids!);
          break;
        case 'kinds':
          query = query.where('kind', 'in', filter.kinds!);
          break;
        case 'authors':
          query = query.where('pubkey', 'in', filter.authors!);
          break;
        case 'since':
          query = query.where('created_at', '>=', filter.since!);
          break;
        case 'until':
          query = query.where('created_at', '<=', filter.until!);
          break;
        case 'limit':
          query = query.limit(filter.limit!);
          break;
      }

      if (key.startsWith('#')) {
        const name = key.replace(/^#/, '');
        const value = filter[key as `#${string}`] as string[];
        query = query
          .leftJoin('nostr_tags', 'nostr_tags.event_id', 'nostr_events.id')
          .where('nostr_tags.name', '=', name)
          .where('nostr_tags.value', 'in', value);
      }
    }

    if (filter.search && this.#fts) {
      query = query
        // @ts-ignore FTS is enabled
        .innerJoin('nostr_fts', 'nostr_fts.event_id', 'nostr_events.id')
        // @ts-ignore FTS is enabled
        .where('nostr_fts.content', 'match', JSON.stringify(filter.search));
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  getEventsQuery(filters: NostrFilter[]) {
    return filters
      .map((filter) => this.#db.selectFrom(() => this.getFilterQuery(this.#db, filter).as('events')).selectAll())
      .reduce((result, query) => result.unionAll(query));
  }

  /** Get events for filters from the database. */
  async query(filters: NostrFilter[], opts: NStoreOpts = {}): Promise<NostrEvent[]> {
    if (!filters.length) return Promise.resolve([]);

    this.#logger('REQ', JSON.stringify(filters));
    let query = this.getEventsQuery(filters);

    if (typeof opts.limit === 'number') {
      query = query.limit(opts.limit);
    }

    return (await query.execute()).map((row) => {
      return {
        id: row.id,
        kind: row.kind,
        pubkey: row.pubkey,
        content: row.content,
        created_at: row.created_at,
        tags: JSON.parse(row.tags),
        sig: row.sig,
      };
    });
  }

  /** Delete events from each table. Should be run in a transaction! */
  async deleteEventsTrx(db: Kysely<NDatabaseSchema>, filters: NostrFilter[]) {
    if (!filters.length) return Promise.resolve();
    this.#logger('DELETE', JSON.stringify(filters));

    const query = this.getEventsQuery(filters).clearSelect().select('id');

    if (this.#fts) {
      await db.deleteFrom('nostr_fts')
        // @ts-ignore FTS is enabled
        .where('event_id', 'in', () => query)
        .execute();
    }

    return db.deleteFrom('nostr_events')
      .where('id', 'in', () => query)
      .execute();
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], _opts?: NStoreOpts): Promise<void> {
    if (!filters.length) return Promise.resolve();
    this.#logger('DELETE', JSON.stringify(filters));

    await this.#db.transaction().execute((trx) => this.deleteEventsTrx(trx, filters));
  }

  /** Get number of events that would be returned by filters. */
  async count(filters: NostrFilter[], _opts: NStoreOpts = {}): Promise<{ count: number; approximate: false}> {
    if (!filters.length) return Promise.resolve({ count: 0, approximate: false });

    this.#logger('COUNT', JSON.stringify(filters));
    const query = this.getEventsQuery(filters);

    const [{ count }] = await query
      .clearSelect()
      .select((eb) => eb.fn.count('id').as('count'))
      .execute();

    return {
      count: Number(count),
      approximate: false,
    };
  }
}

/** Return only the tags that should be indexed. */
function filterIndexableTags(event: NostrEvent): string[][] {
  const tagCounts: Record<string, number> = {};

  function getCount(name: string) {
    return tagCounts[name] || 0;
  }

  function incrementCount(name: string) {
    tagCounts[name] = getCount(name) + 1;
  }

  function checkCondition(name: string, value: string, condition: TagCondition) {
    return condition({
      event,
      count: getCount(name),
      value,
    });
  }

  return event.tags.reduce<string[][]>((results, tag) => {
    const [name, value] = tag;
    const condition = tagConditions[name] as TagCondition | undefined;

    if (value && condition && value.length < 200 && checkCondition(name, value, condition)) {
      results.push(tag);
    }

    incrementCount(name);
    return results;
  }, []);
}

/** Build a search index from the event. */
function buildSearchContent(event: NostrEvent): string {
  switch (event.kind) {
    case 0:
      return buildUserSearchContent(event);
    case 1:
      return event.content;
    case 30009:
      return buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
    default:
      return '';
  }
}

/** Build search content for a user. */
function buildUserSearchContent(event: NostrEvent): string {
  const { name, nip05, about } = jsonMetaContentSchema.parse(event.content);
  return [name, nip05, about].filter(Boolean).join('\n');
}

/** Build search content from tag values. */
function buildTagsSearchContent(tags: string[][]): string {
  return tags.map(([_tag, value]) => value).join('\n');
}
