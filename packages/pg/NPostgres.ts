import { NKinds } from '@nostrify/nostrify';
import { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/types';
import { Kysely, type SelectQueryBuilder, sql } from 'kysely';
import { getFilterLimit } from 'nostr-tools';

/** Kysely database schema for Nostr. */
export interface NPostgresSchema {
  nostr_events: {
    id: string;
    kind: number;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string;
    tags_index: Record<string, string[]>;
    sig: string;
    d: string | null;
  };
  nostr_pgfts: {
    event_id: string;
    search_vec: unknown;
  };
}

/** Options object for the NPostgres constructor. */
export interface NPostgresOpts {
  /** Enable full-text-search for Postgres. Default true. */
  fts?: boolean;
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
  /** Chunk size to use when streaming results with `.req`. Default: 100. */
  chunkSize?: number;
}

export class NPostgres implements NRelay {
  private db: Kysely<NPostgresSchema>;
  private fts?: boolean;
  private indexTags: (event: NostrEvent) => string[][];
  private searchText: (event: NostrEvent) => string | undefined;
  private timeoutStrategy: 'setStatementTimeout' | undefined;
  private chunkSize: number;

  constructor(db: Kysely<any>, opts?: NPostgresOpts) {
    this.db = db as Kysely<NPostgresSchema>;
    this.fts = opts?.fts;
    this.timeoutStrategy = opts?.timeoutStrategy;
    this.indexTags = opts?.indexTags ?? NPostgres.indexTags;
    this.searchText = opts?.searchText ?? NPostgres.searchText;
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
  async event(event: NostrEvent, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    if (await this.isDeleted(event)) {
      throw new Error('Cannot add a deleted event');
    }

    return await NPostgres.trx(this.db, (trx) => {
      return this.withTimeout(trx, async (trx) => {
        await Promise.all([
          this.deleteEvents(trx, event),
          this.insertEvent(trx, event),
          this.indexSearch(trx, event),
        ]);
      }, opts.timeout);
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
  protected async deleteEvents(db: Kysely<NPostgresSchema>, event: NostrEvent): Promise<void> {
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

  /** Insert the event into the database. */
  protected async insertEvent(trx: Kysely<NPostgresSchema>, event: NostrEvent): Promise<void> {
    const d = event.tags.find(([name]) => name === 'd')?.[1];

    const tagIndex = this.indexTags(event).reduce((result, [name, value]) => {
      if (!result[name]) {
        result[name] = [];
      }
      result[name].push(value);
      return result;
    }, {} as Record<string, string[]>);

    const row: NPostgresSchema['nostr_events'] = {
      ...event,
      tags_index: tagIndex,
      tags: JSON.stringify(event.tags),
      d: d ?? (NKinds.parameterizedReplaceable(event.kind) ? '' : null),
    };

    if (NKinds.replaceable(event.kind)) {
      await trx.insertInto('nostr_events')
        .values(row)
        .onConflict((oc) =>
          oc
            .columns(['kind', 'pubkey']).where(() => sql`kind >= 10000 and kind < 20000 or (kind in (0, 3))`)
            .doUpdateSet(row)
            .where((eb) =>
              eb.or([
                eb('nostr_events.created_at', '<', eb.ref('excluded.created_at')),
                eb.and([
                  eb('nostr_events.created_at', '=', eb.ref('excluded.created_at')),
                  eb('nostr_events.id', '<', eb.ref('excluded.id')),
                ]),
              ])
            )
        )
        .execute();
    } else if (NKinds.parameterizedReplaceable(event.kind)) {
      await trx.insertInto('nostr_events')
        .values(row)
        .onConflict((oc) =>
          oc
            .columns(['kind', 'pubkey', 'd']).where(() => sql`kind >= 30000 and kind < 40000`)
            .doUpdateSet(row)
            .where((eb) =>
              eb.or([
                eb('nostr_events.created_at', '<', eb.ref('excluded.created_at')),
                eb.and([
                  eb('nostr_events.created_at', '=', eb.ref('excluded.created_at')),
                  eb('nostr_events.id', '<', eb.ref('excluded.id')),
                ]),
              ])
            )
        )
        .execute();
    } else {
      await trx.insertInto('nostr_events')
        .values(row)
        .execute();
    }
  }

  /** Add search data to the FTS5 table. */
  protected async indexSearch(trx: Kysely<NPostgresSchema>, event: NostrEvent): Promise<void> {
    if (!this.fts) return;

    const content = this.searchText(event);
    if (!content) return;

    if (this.fts) {
      await trx.insertInto('nostr_pgfts')
        .values({
          event_id: event.id,
          search_vec: sql`to_tsvector(${content})`,
        })
        .execute();
    }
  }

  /** Build the query for a filter. */
  protected getFilterQuery(
    trx: Kysely<NPostgresSchema>,
    filter: NostrFilter,
  ): SelectQueryBuilder<NPostgresSchema, 'nostr_events', NPostgresSchema['nostr_events']> {
    let query = trx
      .selectFrom('nostr_events')
      .selectAll('nostr_events')
      .orderBy('nostr_events.created_at', 'desc')
      .orderBy('nostr_events.id', 'asc');

    if (filter.ids) {
      query = query.where('nostr_events.id', '=', ({ fn, val }) => fn.any(val(filter.ids)));
    }
    if (filter.kinds) {
      query = query.where('nostr_events.kind', '=', ({ fn, val }) => fn.any(val(filter.kinds)));
    }
    if (filter.authors) {
      query = query.where('nostr_events.pubkey', '=', ({ fn, val }) => fn.any(val(filter.authors)));
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
      if (this.fts) {
        query = query
          .innerJoin('nostr_pgfts', 'nostr_pgfts.event_id', 'nostr_events.id')
          .where(sql`phraseto_tsquery(${filter.search})`, '@@', sql`search_vec`);
      }

      if (!this.fts) {
        return trx.selectFrom('nostr_events').selectAll('nostr_events').where('nostr_events.id', '=', null);
      }
    }

    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith('#') && Array.isArray(values)) {
        const name = key.replace(/^#/, '');

        if (name === 'd' && filter.kinds?.every((kind) => NKinds.parameterizedReplaceable(kind))) {
          query = query.where('nostr_events.d', '=', ({ fn, val }) => fn.any(val(values)));
        } else {
          query = query.where((eb) =>
            eb.or(
              values.map(
                (value) => eb('nostr_events.tags_index', '@>', { [name]: [value] }),
              ),
            )
          );
        }
      }
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  protected getEventsQuery(
    trx: Kysely<NPostgresSchema>,
    filters: NostrFilter[],
  ): SelectQueryBuilder<NPostgresSchema, 'nostr_events', NPostgresSchema['nostr_events']> {
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
        const event = NPostgres.parseEventRow(row);
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

      return (await query.execute())
        .map((row) => NPostgres.parseEventRow(row));
    }, opts.timeout);
  }

  /** Parse an event row from the database. */
  private static parseEventRow(row: NPostgresSchema['nostr_events']): NostrEvent {
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
  protected async removeEvents(db: Kysely<NPostgresSchema>, filters: NostrFilter[]): Promise<void> {
    return await NPostgres.trx(db, async (trx) => {
      const query = this.getEventsQuery(trx, filters).clearSelect().select('id');

      if (this.fts) {
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

  /** Execute NPostgres functions in a transaction. */
  async transaction(callback: (store: NPostgres, kysely: Kysely<NPostgresSchema>) => Promise<void>): Promise<void> {
    await NPostgres.trx(this.db, async (trx) => {
      const store = new NPostgres(trx as Kysely<NPostgresSchema>, {
        fts: this.fts,
        indexTags: this.indexTags,
        searchText: this.searchText,
      });

      await callback(store, trx);
    });
  }

  /** Execute the callback in a new transaction, unless the Kysely instance is already a transaction. */
  private static async trx<T = unknown>(
    db: Kysely<NPostgresSchema>,
    callback: (trx: Kysely<NPostgresSchema>) => Promise<T>,
  ): Promise<T> {
    if (db.isTransaction) {
      return await callback(db);
    } else {
      return await db.transaction().execute((trx) => callback(trx));
    }
  }

  /** Maybe execute the callback in a transaction with a timeout, if a timeout is provided. */
  private async withTimeout<T>(
    db: Kysely<NPostgresSchema>,
    callback: (trx: Kysely<NPostgresSchema>) => Promise<T>,
    timeout: number | undefined,
  ): Promise<T> {
    if (typeof timeout === 'number') {
      return await NPostgres.trx(db, async (trx) => {
        await this.setTimeout(trx, timeout);
        return await callback(trx);
      });
    } else {
      return await callback(db);
    }
  }

  /** Set a timeout in the current database transaction, if applicable. */
  private async setTimeout(trx: Kysely<NPostgresSchema>, timeout: number): Promise<void> {
    switch (this.timeoutStrategy) {
      case 'setStatementTimeout':
        await this.setLocal(trx, 'statement_timeout', timeout);
    }
  }

  /** Set a local variable in the current database transaction (only works with Postgres). */
  private async setLocal(trx: Kysely<NPostgresSchema>, key: string, value: string | number): Promise<void> {
    await sql`set local ${sql.raw(key)} = ${sql.raw(value.toString())}`.execute(trx);
  }

  /** Migrate the database schema. */
  async migrate(): Promise<void> {
    const schema = this.db.schema;

    await schema
      .createTable('nostr_events')
      .ifNotExists()
      .addColumn('id', 'char(64)', (col) => col.primaryKey())
      .addColumn('kind', 'integer', (col) => col.notNull())
      .addColumn('pubkey', 'char(64)', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('created_at', 'integer', (col) => col.notNull())
      .addColumn('tags', 'text', (col) => col.notNull())
      .addColumn('tags_index', 'jsonb', (col) => col.notNull())
      .addColumn('sig', 'char(128)', (col) => col.notNull())
      .addColumn('d', 'text')
      .addCheckConstraint('nostr_events_kind_positive', sql`kind >= 0`)
      .addCheckConstraint('nostr_events_created_at_positive', sql`created_at >= 0`)
      .addCheckConstraint('nostr_events_d_required', sql`kind < 30000 or kind >= 40000 or d is not null`)
      .execute();

    await schema
      .createIndex('nostr_events_kind')
      .on('nostr_events')
      .ifNotExists()
      .columns(['created_at desc', 'id asc', 'kind', 'pubkey'])
      .execute();

    await schema
      .createIndex('nostr_events_pubkey')
      .on('nostr_events')
      .ifNotExists()
      .columns(['created_at desc', 'id asc', 'pubkey', 'kind'])
      .execute();

    await schema
      .createIndex('nostr_events_tags')
      .on('nostr_events')
      .using('gin')
      .ifNotExists()
      .column('tags_index')
      .execute();

    await schema
      .createIndex('nostr_events_replaceable')
      .unique()
      .on('nostr_events')
      .ifNotExists()
      .columns(['kind', 'pubkey'])
      .where(() => sql`kind >= 10000 and kind < 20000 or (kind in (0, 3))`)
      .execute();

    await schema
      .createIndex('nostr_events_parameterized')
      .unique()
      .on('nostr_events')
      .ifNotExists()
      .columns(['kind', 'pubkey', 'd'])
      .where(() => sql`kind >= 30000 and kind < 40000`)
      .execute();

    if (this.fts) {
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
