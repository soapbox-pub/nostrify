import { Kysely, type SelectQueryBuilder, sql } from 'kysely';
import { getFilterLimit, sortEvents } from 'nostr-tools';

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
    kind: number;
    pubkey: string;
    created_at: number;
  };
  nostr_fts5: {
    event_id: string;
    content: string;
  };
  nostr_pgfts: {
    event_id: string;
    search_vec: unknown;
  };
}

export interface NDatabaseOpts {
  /** Enable full-text-search for Postgres or SQLite. Disabled by default. */
  fts?: 'sqlite' | 'postgres';
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
  /** Strategy to use for handling the `timeout` opt. */
  timeoutStrategy?: 'setStatementTimeout' | undefined;
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
  private fts?: 'sqlite' | 'postgres';
  private indexTags: (event: NostrEvent) => string[][];
  private searchText: (event: NostrEvent) => string | undefined;
  private timeoutStrategy: 'setStatementTimeout' | undefined;

  constructor(db: Kysely<any>, opts?: NDatabaseOpts) {
    this.db = db as Kysely<NDatabaseSchema>;
    this.fts = opts?.fts;
    this.timeoutStrategy = opts?.timeoutStrategy;
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
  async event(event: NostrEvent, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    if (await this.isDeleted(event)) {
      throw new Error('Cannot add a deleted event');
    }
    return await NDatabase.trx(this.db, (trx) => {
      return this.withTimeout(trx, async (trx) => {
        await Promise.all([
          this.deleteEvents(trx, event),
          this.replaceEvents(trx, event),
        ]);
        await this.insertEvent(trx, event);
        await Promise.all([
          this.insertTags(trx, event),
          this.indexSearch(trx, event),
        ]);
      }, opts.timeout);
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

    if (NKinds.replaceable(event.kind) || NKinds.parameterizedReplaceable(event.kind)) {
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
  protected async insertEvent(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    await trx.insertInto('nostr_events')
      .values({ ...event, tags: JSON.stringify(event.tags) })
      .execute();
  }

  /** Insert event tags depending on the event and settings. */
  protected async insertTags(trx: Kysely<NDatabaseSchema>, event: NostrEvent): Promise<void> {
    const { id, kind, pubkey, created_at } = event;

    const tags = this.indexTags(event);
    const rows = tags.map(([name, value]) => ({ event_id: id, name, value, kind, pubkey, created_at }));

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

    if (this.fts === 'postgres') {
      await trx.insertInto('nostr_pgfts')
        .values({
          event_id: event.id,
          search_vec: sql`to_tsvector(${content})`,
        })
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

  /** Whether results should be sorted reverse-chronologically by the database. */
  static shouldOrder(filter: NostrFilter): boolean {
    // deno-lint-ignore no-unused-vars
    const { limit, ...rest } = filter;

    const intrinsicLimit = getFilterLimit(filter);
    const potentialLimit = getFilterLimit(rest);

    if (intrinsicLimit === Infinity && potentialLimit === Infinity) {
      return true;
    } else {
      return intrinsicLimit < potentialLimit;
    }
  }

  /** Build the query for a filter. */
  protected getFilterQuery(
    trx: Kysely<NDatabaseSchema>,
    filter: NostrFilter,
  ): SelectQueryBuilder<NDatabaseSchema, 'nostr_events', NDatabaseSchema['nostr_events']> {
    let query = trx
      .selectFrom('nostr_events')
      .selectAll('nostr_events');

    // Avoid ORDER BY for certain queries.
    if (NDatabase.shouldOrder(filter)) {
      query = query.orderBy('nostr_events.created_at', 'desc').orderBy('nostr_events.id', 'asc');
    }

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

      if (this.fts === 'postgres') {
        query = query
          .innerJoin('nostr_pgfts', 'nostr_pgfts.event_id', 'nostr_events.id')
          .where(sql`phraseto_tsquery(${filter.search})`, '@@', sql`search_vec`);
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

        let joinedQuery = query
          .innerJoin(`nostr_tags as ${alias}`, `${alias}.event_id`, 'nostr_events.id')
          .where(`${alias}.name`, '=', name)
          .where(`${alias}.value`, 'in', value);

        if (filter.ids) {
          joinedQuery = joinedQuery.where(`${alias}.event_id`, 'in', filter.ids);
        }
        if (filter.kinds) {
          joinedQuery = joinedQuery.where(`${alias}.kind`, 'in', filter.kinds);
        }
        if (filter.authors) {
          joinedQuery = joinedQuery.where(`${alias}.pubkey`, 'in', filter.authors);
        }

        // @ts-ignore String interpolation confuses Kysely.
        query = joinedQuery;
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

  /** Get events for filters from the database. */
  async query(
    filters: NostrFilter[],
    opts: { timeout?: number; signal?: AbortSignal; limit?: number } = {},
  ): Promise<NostrEvent[]> {
    filters = this.normalizeFilters(filters);

    if (!filters.length) {
      return [];
    }

    return await this.withTimeout(this.db, async (trx) => {
      let query = this.getEventsQuery(trx, filters);

      if (typeof opts.limit === 'number') {
        query = query.limit(opts.limit);
      }

      const events = (await query.execute()).map((row) => {
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

      return sortEvents(events);
    }, opts.timeout);
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

      if (this.fts === 'postgres') {
        await trx.deleteFrom('nostr_pgfts')
          .where('nostr_pgfts.event_id', 'in', () => query)
          .execute();
      }

      await trx.deleteFrom('nostr_events')
        .where('nostr_events.id', 'in', () => query)
        .execute();
    });
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    await this.withTimeout(this.db, (trx) => this.removeEvents(trx, filters), opts.timeout);
  }

  /** Get number of events that would be returned by filters. */
  async count(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<{ count: number; approximate: false }> {
    return await this.withTimeout(this.db, async (trx) => {
      const query = this.getEventsQuery(trx, filters);
      const [{ count }] = await query
        .clearSelect()
        .select((eb) => eb.fn.count('nostr_events.id').as('count'))
        .execute();

      return {
        count: Number(count),
        approximate: false,
      };
    }, opts.timeout);
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

  /** Maybe execute the callback in a transaction with a timeout, if a timeout is provided. */
  private async withTimeout<T>(
    db: Kysely<NDatabaseSchema>,
    callback: (trx: Kysely<NDatabaseSchema>) => Promise<T>,
    timeout: number | undefined,
  ): Promise<T> {
    if (typeof timeout === 'number') {
      return await NDatabase.trx(db, async (trx) => {
        await this.setTimeout(trx, timeout);
        return await callback(trx);
      });
    } else {
      return await callback(db);
    }
  }

  /** Set a timeout in the current database transaction, if applicable. */
  private async setTimeout(trx: Kysely<NDatabaseSchema>, timeout: number): Promise<void> {
    switch (this.timeoutStrategy) {
      case 'setStatementTimeout':
        await this.setLocal(trx, 'statement_timeout', timeout);
    }
  }

  /** Set a local variable in the current database transaction (only works with Postgres). */
  private async setLocal(trx: Kysely<NDatabaseSchema>, key: string, value: string | number): Promise<void> {
    await sql`set local ${sql.raw(key)} = ${sql.raw(value.toString())}`.execute(trx);
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
      .addColumn('event_id', 'text', (col) => col.references('nostr_events.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('value', 'text', (col) => col.notNull())
      .addColumn('kind', 'integer', (col) => col.notNull())
      .addColumn('pubkey', 'text', (col) => col.notNull())
      .addColumn('created_at', 'integer', (col) => col.notNull())
      .execute();

    await schema.createIndex('nostr_events_kind').on('nostr_events').ifNotExists().column('kind').execute();
    await schema.createIndex('nostr_events_pubkey').on('nostr_events').ifNotExists().column('pubkey').execute();
    await schema
      .createIndex('nostr_events_created_at')
      .on('nostr_events')
      .ifNotExists()
      .columns(['created_at desc', 'id asc'])
      .execute();
    await schema
      .createIndex('nostr_events_kind_pubkey_created_at')
      .on('nostr_events')
      .ifNotExists()
      .columns(['kind', 'pubkey', 'created_at desc', 'id asc'])
      .execute();

    await schema.createIndex('nostr_tags_event_id').on('nostr_tags').ifNotExists().column('event_id').execute();
    await schema
      .createIndex('nostr_tags_value_name')
      .on('nostr_tags')
      .ifNotExists()
      .columns(['value', 'name'])
      .execute();
    await schema.createIndex('nostr_tags_kind').on('nostr_tags').ifNotExists().column('kind').execute();
    await schema.createIndex('nostr_tags_pubkey').on('nostr_tags').ifNotExists().column('pubkey').execute();
    await schema
      .createIndex('nostr_tags_created_at')
      .on('nostr_tags')
      .ifNotExists()
      .columns(['created_at desc', 'event_id asc'])
      .execute();
    await schema
      .createIndex('nostr_tags_kind_created_at')
      .on('nostr_tags')
      .ifNotExists()
      .columns(['value', 'name', 'kind', 'created_at desc', 'event_id asc'])
      .execute();
    await schema
      .createIndex('nostr_tags_kind_pubkey_created_at')
      .on('nostr_tags')
      .ifNotExists()
      .columns(['value', 'name', 'kind', 'pubkey', 'created_at desc', 'event_id asc'])
      .execute();

    if (this.fts === 'sqlite') {
      await sql`CREATE VIRTUAL TABLE nostr_fts5 USING fts5(event_id, content)`.execute(this.db);
    }

    if (this.fts === 'postgres') {
      await schema.createTable('nostr_pgfts')
        .ifNotExists()
        .addColumn('event_id', 'text', (c) => c.primaryKey().references('nostr_events.id').onDelete('cascade'))
        .addColumn('search_vec', sql`tsvector`, (c) => c.notNull())
        .execute();

      await schema.createIndex('nostr_pgfts_gin_search_vec')
        .ifNotExists()
        .on('nostr_pgfts')
        .using('gin')
        .column('search_vec')
        .execute();
    }
  }
}
