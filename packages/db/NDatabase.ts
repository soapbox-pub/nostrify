import { NKinds } from '@nostrify/nostrify';
import { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/types';
import { Kysely, type SelectQueryBuilder, sql } from 'kysely';
import { getFilterLimit } from 'nostr-tools';

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
  nostr_fts5: {
    event_id: string;
    content: string;
  };
}

/** Options object for the NDatabase constructor. */
export interface NDatabaseOpts {
  /** Enable full-text-search for SQLite. Disabled by default. */
  fts?: 'sqlite';
  /**
   * Function that returns which tags to index so tag queries like `{ "#p": ["123"] }` will work.
   * By default, all single-letter tags are indexed.
   */
  indexTags?(event: NostrEvent): string[][];
  /**
   * Build a search index from the event.
   * By default, only kinds 0 and 1 events are indexed for search, and the search text is the event content with tag values appended to it.
   * Only applicable if `fts5` is `true`.
   */
  searchText?(event: NostrEvent): string | undefined;
  /** Chunk size to use when streaming results with `.req`. Default: 100. */
  chunkSize?: number;
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
export class NDatabase implements NRelay {
  private db: Kysely<NDatabaseSchema>;
  private fts?: 'sqlite';
  private indexTags: (event: NostrEvent) => string[][];
  private searchText: (event: NostrEvent) => string | undefined;
  private chunkSize: number;

  constructor(db: Kysely<any>, opts?: NDatabaseOpts) {
    this.db = db as Kysely<NDatabaseSchema>;
    this.fts = opts?.fts;
    this.indexTags = opts?.indexTags ?? NDatabase.indexTags;
    this.searchText = opts?.searchText ?? NDatabase.searchText;
    this.chunkSize = opts?.chunkSize ?? 100;
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
  async event(event: NostrEvent, _opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    if (await this.isDeleted(event)) {
      throw new Error('Cannot add a deleted event');
    }
    return await NDatabase.trx(this.db, async (trx) => {
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
    const filters: NostrFilter[] = [
      { kinds: [5], authors: [event.pubkey], '#e': [event.id], limit: 1 },
    ];

    if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
      const d = event.tags.find(([tag]) => tag === 'd')?.[1] ?? '';

      filters.push({
        kinds: [5],
        authors: [event.pubkey],
        '#a': [`${event.kind}:${event.pubkey}:${d}`],
        since: event.created_at,
        limit: 1,
      });
    }

    const events = await this.query(filters);
    return events.length > 0;
  }

  /** Delete events referenced by kind 5. */
  protected async deleteEvents(db: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    if (event.kind === 5) {
      const ids = new Set(event.tags.filter(([name]) => name === 'e').map(([_name, value]) => value));
      const addrs = new Set(event.tags.filter(([name]) => name === 'a').map(([_name, value]) => value));

      const filters: NostrFilter[] = [];

      if (ids.size) {
        filters.push({ ids: [...ids], authors: [event.pubkey] });
      }

      for (const addr of addrs) {
        const [k, pubkey, d] = addr.split(':');
        const kind = Number(k);

        if (pubkey !== event.pubkey) continue;
        if (!(Number.isInteger(kind) && kind >= 0)) continue;
        if (d === undefined) continue;

        const filter: NostrFilter = {
          kinds: [kind],
          authors: [event.pubkey],
          until: event.created_at,
        };

        if (d) {
          filter['#d'] = [d];
        }

        filters.push(filter);
      }

      if (filters.length) {
        await this.removeEvents(db, filters);
      }
    }
  }

  /** Replace events in NIP-01 replaceable ranges with the same kind and pubkey. */
  protected async replaceEvents(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    if (NKinds.replaceable(event.kind)) {
      await this.deleteReplaced(
        trx,
        event,
        { kinds: [event.kind], authors: [event.pubkey] },
        (event, prevEvent) => event.created_at > prevEvent.created_at,
        'Cannot replace an event with an older event',
      );
    }

    if (NKinds.addressable(event.kind)) {
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
  protected async insertEvent(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    await trx.insertInto('nostr_events')
      .values({ ...event, tags: JSON.stringify(event.tags) })
      .execute();
  }

  /** Insert event tags depending on the event and settings. */
  protected async insertTags(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    const tags = this.indexTags(event);
    const rows = tags.map(([name, value]) => ({ event_id: event.id, name, value }));

    if (!tags.length) return;
    await trx.insertInto('nostr_tags')
      .values(rows)
      .execute();
  }

  /** Add search data to the FTS5 table. */
  protected async indexSearch(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    if (!this.fts) return;

    const content = this.searchText(event);
    if (!content) return;

    if (this.fts === 'sqlite') {
      await trx.insertInto('nostr_fts5')
        .values({ event_id: event.id, content })
        .execute();
    }
  }

  /** Delete events that are replaced by the new event. */
  protected async deleteReplaced(
    trx: Kysely<NDatabaseSchema>,
    event: NostrEvent,
    filter: NostrFilter,
    replaces: (event: NostrEvent, prevEvent: NDatabaseSchema['nostr_events']) => boolean,
    error: string,
  ): Promise<void> {
    const prevEvents = await this.getFilterQuery(trx, filter).execute();
    for (const prevEvent of prevEvents) {
      if (!replaces(event, prevEvent)) {
        throw new Error(error);
      }
    }
    await this.removeEvents(trx, [filter]);
  }

  /** Build the query for a filter. */
  protected getFilterQuery(
    trx: Kysely<NDatabaseSchema>,
    filter: NostrFilter,
  ): SelectQueryBuilder<NDatabaseSchema, 'nostr_events', NDatabaseSchema['nostr_events']> {
    let query = trx
      .selectFrom('nostr_events')
      .selectAll('nostr_events')
      .orderBy('nostr_events.created_at', 'desc')
      .orderBy('nostr_events.id', 'asc');

    if (filter.ids) {
      query = query.where('nostr_events.id', 'in', filter.ids);
    }
    if (filter.kinds) {
      query = query.where('nostr_events.kind', 'in', filter.kinds);
    }
    if (filter.authors) {
      query = query.where('nostr_events.pubkey', 'in', filter.authors);
    }
    if (typeof filter.since === 'number') {
      query = query.where('nostr_events.created_at', '>=', filter.since);
    }
    if (typeof filter.until === 'number') {
      query = query.where('nostr_events.created_at', '<=', filter.until);
    }
    if (typeof filter.limit === 'number') {
      query = query.limit(filter.limit);
    }

    if (filter.search) {
      if (this.fts === 'sqlite') {
        query = query
          .innerJoin('nostr_fts5', 'nostr_fts5.event_id', 'nostr_events.id')
          .where('nostr_fts5.content', 'match', JSON.stringify(filter.search));
      }

      if (!this.fts) {
        return trx.selectFrom('nostr_events').selectAll('nostr_events').where('nostr_events.id', '=', null);
      }
    }

    let i = 0;
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('#') && Array.isArray(value)) {
        const name = key.replace(/^#/, '');
        const alias = `tag${i++}` as const;
        // @ts-ignore String interpolation confuses Kysely.
        query = query
          .innerJoin(`nostr_tags as ${alias}`, `${alias}.event_id`, 'nostr_events.id')
          .where(`${alias}.name`, '=', name)
          .where(`${alias}.value`, 'in', value);
      }
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  protected getEventsQuery(
    trx: Kysely<NDatabaseSchema>,
    filters: NostrFilter[],
  ): SelectQueryBuilder<NDatabaseSchema, 'nostr_events', NDatabaseSchema['nostr_events']> {
    return filters
      .map((filter) =>
        trx
          .selectFrom(() => this.getFilterQuery(trx, filter).as('nostr_events'))
          .selectAll()
      )
      .reduce((result, query) => result.unionAll(query));
  }

  /**
   * Stream events, mimicking a relay.
   *
   * This method uses the database's native streaming mechanism, so both the database
   * and Kysely dialect must support it. Set the `cunkSize` in the constructor to control
   * how many rows are fetched at once.
   *
   * Yields `EVENT` messages until the query completes, then it will yield `EOSE`, then `CLOSED`.
   * If the signal is aborted, it will yield `CLOSED` on the next iteration.
   */
  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const subId = crypto.randomUUID();
    filters = this.normalizeFilters(filters);

    if (filters.length) {
      const rows = this.getEventsQuery(this.db, filters).stream(this.chunkSize);

      for await (const row of rows) {
        const event = NDatabase.parseEventRow(row);
        yield ['EVENT', subId, event];

        if (opts?.signal?.aborted) {
          yield ['CLOSED', subId, 'aborted'];
          return;
        }
      }
    }

    yield ['EOSE', subId];
    yield ['CLOSED', subId, 'finished'];
  }

  /** Get events for filters from the database. */
  async query(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; limit?: number } = {},
  ): Promise<NostrEvent[]> {
    filters = this.normalizeFilters(filters);

    if (!filters.length) {
      return [];
    }

    let query = this.getEventsQuery(this.db, filters);

    if (typeof opts.limit === 'number') {
      query = query.limit(opts.limit);
    }

    return (await query.execute())
      .map((row) => NDatabase.parseEventRow(row));
  }

  /** Parse an event row from the database. */
  private static parseEventRow(row: NDatabaseSchema['nostr_events']): NostrEvent {
    return {
      id: row.id,
      kind: row.kind,
      pubkey: row.pubkey,
      content: row.content,
      created_at: row.created_at,
      tags: JSON.parse(row.tags),
      sig: row.sig,
    };
  }

  /** Normalize the `limit` of each filter, and remove filters that can't produce any events. */
  protected normalizeFilters(filters: NostrFilter[]): NostrFilter[] {
    return filters.reduce<NostrFilter[]>((acc, filter) => {
      const limit = getFilterLimit(filter);
      if (limit > 0) {
        acc.push(limit === Infinity ? filter : { ...filter, limit });
      }
      return acc;
    }, []);
  }

  /** Remove events from the database. */
  protected async removeEvents(db: Kysely<NDatabaseSchema>, filters: NostrFilter[]): Promise<void> {
    return await NDatabase.trx(db, async (trx) => {
      const query = this.getEventsQuery(trx, filters).clearSelect().select('id');

      if (this.fts === 'sqlite') {
        await trx.deleteFrom('nostr_fts5')
          .where('nostr_fts5.event_id', 'in', () => query)
          .execute();
      }

      await trx.deleteFrom('nostr_events')
        .where('nostr_events.id', 'in', () => query)
        .execute();
    });
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], _opts: { signal?: AbortSignal } = {}): Promise<void> {
    await NDatabase.trx(this.db, (trx) => this.removeEvents(trx, filters));
  }

  /** Get number of events that would be returned by filters. */
  async count(
    filters: NostrFilter[],
    _opts: { signal?: AbortSignal } = {},
  ): Promise<{ count: number; approximate: false }> {
    const query = this.getEventsQuery(this.db, filters);

    const [{ count }] = await query
      .clearSelect()
      .select((eb) => eb.fn.count('nostr_events.id').as('count'))
      .execute();

    return {
      count: Number(count),
      approximate: false,
    };
  }

  /** Execute NDatabase functions in a transaction. */
  async transaction(callback: (store: NDatabase, kysely: Kysely<NDatabaseSchema>) => Promise<void>): Promise<void> {
    await NDatabase.trx(this.db, async (trx) => {
      const store = new NDatabase(trx as Kysely<NDatabaseSchema>, {
        fts: this.fts,
        indexTags: this.indexTags,
        searchText: this.searchText,
      });

      await callback(store, trx);
    });
  }

  /** Execute the callback in a new transaction, unless the Kysely instance is already a transaction. */
  private static async trx<T = unknown>(
    db: Kysely<NDatabaseSchema>,
    callback: (trx: Kysely<NDatabaseSchema>) => Promise<T>,
  ): Promise<T> {
    if (db.isTransaction) {
      return await callback(db);
    } else {
      return await db.transaction().execute((trx) => callback(trx));
    }
  }

  async close(): Promise<void> {
    await this.db.destroy();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /** Migrate the database schema. */
  async migrate(): Promise<void> {
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
      .addColumn('event_id', 'text', (col) => col.notNull().references('nostr_events.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('value', 'text', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('nostr_events_replaceable_idx')
      .unique()
      .on('nostr_events')
      .ifNotExists()
      .columns(['kind', 'pubkey'])
      .where(() => sql`kind >= 10000 and kind < 20000 or (kind in (0, 3))`)
      .execute();
    await schema
      .createIndex('nostr_events_kind_idx')
      .on('nostr_events')
      .ifNotExists()
      .columns(['created_at desc', 'id asc', 'kind', 'pubkey'])
      .execute();
    await schema
      .createIndex('nostr_events_pubkey_idx')
      .on('nostr_events')
      .ifNotExists()
      .columns(['created_at desc', 'id asc', 'pubkey', 'kind'])
      .execute();

    await schema
      .createIndex('nostr_tags_value_name_idx')
      .on('nostr_tags')
      .ifNotExists()
      .columns(['value', 'name'])
      .execute();

    if (this.fts === 'sqlite') {
      await sql`CREATE VIRTUAL TABLE nostr_fts5 USING fts5(event_id, content)`.execute(this.db);
    }
  }
}
