import { Kysely, sql } from 'npm:kysely@^0.27.2';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NStore } from '../interfaces/NStore.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';

import { NKinds } from './NKinds.ts';

/** Kysely database schema for Nostr. */
export interface NDatabaseSchema {
  nostr_events: {
    id: string;
    kind: number;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string;
    sig: string;
  };
  nostr_tags: {
    event_id: string;
    name: string;
    value: string;
  };
  nostr_fts: {
    event_id: string;
    content: string;
  };
}

export interface NDatabaseOpts {
  /** Whether or not to use FTS. */
  fts?: boolean;
  /**
   * Function that returns which tags to index so tag queries like `{ "#p": ["123"] }` will work.
   * By default, all single-letter tags are indexed.
   */
  indexTags?(event: NostrEvent): string[][];
  /**
   * Build a search index from the event.
   * By default, only kinds 0 and 1 events are indexed for search, and the search text is the event content with tag values appended to it.
   * Only applicable if `fts` is `true`.
   */
  searchText?(event: NostrEvent): string | undefined;
}

/**
 * SQLite database storage adapter for Nostr events.
 * It uses [Kysely](https://kysely.dev/) to make queries, making it flexible for a variety of use-cases.
 *
 * ```ts
 * // Create a Kysely instance.
 * const kysely = new Kysely({
 *   dialect: new DenoSqliteDialect({
 *     database: new Sqlite('./db.sqlite3'),
 *   }),
 * });
 *
 * // Pass Kysely into the constructor.
 * const db = new NDatabase(kysely);
 *
 * // Migrate the database before use.
 * await db.migrate();
 *
 * // Now it's just a regular storage.
 * await db.event(event1);
 * await db.event(event2);
 * const events = await db.query([{ kinds: [1] }]);
 * ```
 */
export class NDatabase implements NStore {
  private db: Kysely<NDatabaseSchema>;
  private fts: boolean;
  private indexTags: (event: NostrEvent) => string[][];
  private searchText: (event: NostrEvent) => string | undefined;

  constructor(db: Kysely<any>, opts?: NDatabaseOpts) {
    this.db = db as Kysely<NDatabaseSchema>;
    this.fts = opts?.fts ?? false;
    this.indexTags = opts?.indexTags ?? NDatabase.indexTags;
    this.searchText = opts?.searchText ?? NDatabase.searchText;
  }

  /** Default tag index function. */
  static indexTags(event: NostrEvent): string[][] {
    return event.tags.filter(([name, value]) => name.length === 1 && value && value.length < 200);
  }

  /** Default search content builder. */
  static searchText(event: NostrEvent): string | undefined {
    if (event.kind === 0 || event.kind === 1) {
      return `${event.content} ${event.tags.map(([_name, value]) => value).join(' ')}`.substring(0, 1000);
    }
  }

  /** Insert an event (and its tags) into the database. */
  async event(event: NostrEvent): Promise<void> {
    if (await this.isDeleted(event)) {
      throw new Error('Cannot add a deleted event');
    }
    return await this.db.transaction().execute(async (trx) => {
      await Promise.all([
        this.deleteEvents(trx, event),
        this.replaceEvents(trx, event),
      ]);
      await this.insertEvent(trx, event);
      await Promise.all([
        this.insertTags(trx, event),
        this.indexSearch(trx, event),
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

  /** Check if an event has been deleted. */
  protected async isDeleted(event: NostrEvent): Promise<boolean> {
    const { count } = await this.count([
      { kinds: [5], authors: [event.pubkey], '#e': [event.id], limit: 1 },
    ]);
    return count > 0;
  }

  /** Delete events referenced by kind 5. */
  protected async deleteEvents(trx: Kysely<NDatabaseSchema>, event: NostrEvent) {
    if (event.kind === 5) {
      await this.deleteEventsTrx(trx, [{
        ids: event.tags.filter(([name]) => name === 'e')?.[1],
      }]);
    }
  }

  /** Replace events in NIP-01 replaceable ranges with the same kind and pubkey. */
  protected async replaceEvents(trx: Kysely<NDatabaseSchema>, event: NostrEvent) {
    if (NKinds.replaceable(event.kind)) {
      await this.deleteReplaced(
        trx,
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
          trx,
          event,
          { kinds: [event.kind], authors: [event.pubkey], '#d': [d] },
          (event, prevEvent) => event.created_at > prevEvent.created_at,
          'Cannot replace an event with an older event',
        );
      }
    }
  }

  /** Insert the event into the database. */
  protected async insertEvent(trx: Kysely<NDatabaseSchema>, event: NostrEvent) {
    await trx.insertInto('nostr_events')
      .values({ ...event, tags: JSON.stringify(event.tags) })
      .execute();
  }

  /** Insert event tags depending on the event and settings. */
  protected async insertTags(trx: Kysely<NDatabaseSchema>, event: NostrEvent) {
    const tags = this.indexTags(event);
    const rows = tags.map(([name, value]) => ({ event_id: event.id, name, value }));

    if (!tags.length) return;
    await trx.insertInto('nostr_tags')
      .values(rows)
      .execute();
  }

  /** Add search data to the FTS table. */
  protected async indexSearch(trx: Kysely<NDatabaseSchema>, event: NostrEvent) {
    if (!this.fts) return;
    const content = this.searchText(event);
    if (!content) return;
    await trx.insertInto('nostr_fts')
      .values({ event_id: event.id, content })
      .execute();
  }

  /** Delete events that are replaced by the new event. */
  protected async deleteReplaced(
    trx: Kysely<NDatabaseSchema>,
    event: NostrEvent,
    filter: NostrFilter,
    replaces: (event: NostrEvent, prevEvent: NDatabaseSchema['nostr_events']) => boolean,
    error: string,
  ) {
    const prevEvents = await this.getFilterQuery(trx, filter).execute();
    for (const prevEvent of prevEvents) {
      if (!replaces(event, prevEvent)) {
        throw new Error(error);
      }
    }
    await this.deleteEventsTrx(trx, [filter]);
  }

  /** Build the query for a filter. */
  protected getFilterQuery(db: Kysely<NDatabaseSchema>, filter: NostrFilter) {
    let query = db
      .selectFrom('nostr_events')
      .selectAll()
      .orderBy('created_at', 'desc');

    if (filter.ids) {
      query = query.where('id', 'in', filter.ids);
    }
    if (filter.kinds) {
      query = query.where('kind', 'in', filter.kinds);
    }
    if (filter.authors) {
      query = query.where('pubkey', 'in', filter.authors);
    }
    if (typeof filter.since === 'number') {
      query = query.where('created_at', '>=', filter.since);
    }
    if (typeof filter.until === 'number') {
      query = query.where('created_at', '<=', filter.until);
    }
    if (typeof filter.limit === 'number') {
      query = query.limit(filter.limit);
    }

    if (filter.search && this.fts) {
      query = query
        .innerJoin('nostr_fts', 'nostr_fts.event_id', 'nostr_events.id')
        .where('nostr_fts.content', 'match', JSON.stringify(filter.search));
    }

    const joinedQuery = query.leftJoin('nostr_tags', 'nostr_tags.event_id', 'nostr_events.id');

    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('#') && Array.isArray(value)) {
        const name = key.replace(/^#/, '');
        query = joinedQuery
          .where('nostr_tags.name', '=', name)
          .where('nostr_tags.value', 'in', value);
      }
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  protected getEventsQuery(filters: NostrFilter[]) {
    return filters
      .map((filter) =>
        this.db
          .selectFrom(() => this.getFilterQuery(this.db, filter).as('nostr_events'))
          .selectAll()
      )
      .reduce((result, query) => result.unionAll(query));
  }

  /** Get events for filters from the database. */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<NostrEvent[]> {
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
  protected async deleteEventsTrx(db: Kysely<NDatabaseSchema>, filters: NostrFilter[]) {
    const query = this.getEventsQuery(filters).clearSelect().select('id');

    if (this.fts) {
      await db.deleteFrom('nostr_fts')
        .where('event_id', 'in', () => query)
        .execute();
    }

    return db.deleteFrom('nostr_events')
      .where('id', 'in', () => query)
      .execute();
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[]): Promise<void> {
    await this.db.transaction().execute((trx) => this.deleteEventsTrx(trx, filters));
  }

  /** Get number of events that would be returned by filters. */
  async count(filters: NostrFilter[]): Promise<{ count: number; approximate: false }> {
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

  /** Migrate the database schema. */
  async migrate() {
    const schema = this.db.schema;

    await schema
      .createTable('nostr_events')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('kind', 'integer', (col) => col.notNull())
      .addColumn('pubkey', 'text', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('created_at', 'integer', (col) => col.notNull())
      .addColumn('tags', 'text', (col) => col.notNull())
      .addColumn('sig', 'text', (col) => col.notNull())
      .execute();

    await schema
      .createTable('nostr_tags')
      .ifNotExists()
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('value', 'text', (col) => col.notNull())
      .addColumn('event_id', 'text', (col) => col.references('nostr_events.id').onDelete('cascade'))
      .execute();

    await schema.createIndex('nostr_events_kind').on('nostr_events').ifNotExists().column('kind').execute();
    await schema.createIndex('nostr_events_pubkey').on('nostr_events').ifNotExists().column('pubkey').execute();
    await schema.createIndex('nostr_tags_name').on('nostr_tags').ifNotExists().column('name').execute();
    await schema.createIndex('nostr_tags_value').on('nostr_tags').ifNotExists().column('value').execute();
    await schema.createIndex('nostr_tags_event_id').on('nostr_tags').ifNotExists().column('event_id').execute();

    if (this.fts) {
      await sql`CREATE VIRTUAL TABLE nostr_fts USING fts5(event_id, content)`.execute(this.db);
    }
  }
}
