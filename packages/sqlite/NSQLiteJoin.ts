import { NKinds, RelayError } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter, NostrRelayCOUNT, NStore } from '@nostrify/types';

import type { NSQLiteDatabase, NSQLiteOpts, NSQLiteValue } from './types.ts';
import { ParsedFilter } from './ParsedFilter.ts';
import { batch, memberOf, where } from './sql.ts';

// ============================================================================
// NSQLiteJoin — a relational `NStore` backed by SQLite.
//
// This is the conventional design: an events table and a tags table, joined
// together, with one SQL statement per filter and SQLite's own planner
// choosing how to execute it. It's the shape almost every SQL-backed Nostr
// relay uses, and the counterpart to {@link NSQLite}, which instead treats
// SQLite as a key/value store with hand-picked indexes and no joins.
//
// Both classes implement identical semantics — same tag index policy, same
// replaceable/addressable supersession, same NIP-09 and NIP-50 behavior — so
// they can be benchmarked against each other directly. See NSQLite.bench.ts.
//
// Storage layout:
//
//   nostr_events   one row per event, with `kind`, `pubkey`, `created_at` and
//                  `d` lifted out of the JSON so they can be indexed.
//   nostr_tags     one row per indexed tag, `(name, value, event_id)`, plus a
//                  secondary index on `event_id` so an event's tags can be
//                  deleted without scanning.
//
// Query construction: every condition becomes part of one statement. Tag terms
// become `INNER JOIN`s against the tag table — one join per `#tag` term in the
// filter — and everything else becomes a `WHERE` clause on the events table.
// `DISTINCT` is added only when a join can actually duplicate a row (a tag term
// with more than one value), since it forces a sorter over the result.
//
// No `INDEXED BY`: picking the join order and the driving index is precisely
// what SQLite's planner is for here, which is the point of the comparison.
//
// The one thing that can't go in the statement is NIP-50 keyword matching,
// which is done in memory, paging the scan by keyset so memory stays bounded.
// ============================================================================

/** How many rows a paged scan reads per round trip when post-filtering. */
const CHUNK_SIZE = 512;

/** Upper bound on bound parameters per statement. */
const MAX_PARAMS = 900;

/** Longest `IN (…)` list used in a statement before it is split. */
const MAX_IN = 500;

/**
 * A relational `NStore` backed by SQLite: an events table and a tags table,
 * joined together, planned by SQLite.
 *
 * The interface is identical to {@link NSQLite}, including the driver object:
 *
 * ```ts
 * import { DatabaseSync } from 'node:sqlite';
 * import { NSQLiteJoin } from '@nostrify/sqlite';
 *
 * const sqlite = new DatabaseSync('events.db');
 *
 * const store = new NSQLiteJoin({
 *   run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
 *   all: (sql, params = []) => sqlite.prepare(sql).all(...params),
 *   close: () => sqlite.close(),
 * });
 *
 * await store.migrate();
 * ```
 *
 * `NSQLite` is faster on most query shapes — see the package README — so prefer
 * it unless you specifically want the relational schema.
 */
export class NSQLiteJoin implements NStore {
  private readonly db: NSQLiteDatabase;
  private readonly indexTags: (event: NostrEvent) => string[][];
  private readonly onQuery?: (sql: string, params: NSQLiteValue[]) => void;

  private readonly events: string;
  private readonly tags: string;

  /**
   * Tail of the write chain. Transactions queue behind it rather than
   * interleaving, since SQLite has no nested transactions and two overlapping
   * writers would otherwise share — and roll back — each other's work.
   */
  private writeLock: Promise<unknown> = Promise.resolve();

  constructor(db: NSQLiteDatabase, opts: NSQLiteOpts = {}) {
    const prefix = opts.tablePrefix ?? 'nostr';

    this.db = db;
    this.indexTags = opts.indexTags ?? NSQLiteJoin.indexTags;
    this.onQuery = opts.onQuery;

    this.events = `${prefix}_events`;
    this.tags = `${prefix}_tags`;
  }

  /**
   * Default tag index policy: index every single-letter tag with a non-empty
   * value under 200 chars.
   */
  static indexTags(event: NostrEvent): string[][] {
    return event.tags.filter(([name, value]) => name.length === 1 && !!value && value.length < 200);
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  /** Create the tables and indexes, if they don't already exist. */
  async migrate(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.events} (
        id TEXT PRIMARY KEY,
        kind INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        d TEXT,
        json TEXT NOT NULL
      )
    `);

    // Ordering indexes, each ending in (created_at DESC, id ASC) so the
    // planner can satisfy the sort from an index rather than a sorter.
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.events}_created_at ON ${this.events} (created_at DESC, id ASC)`,
    );
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.events}_pubkey ON ${this.events} (pubkey, created_at DESC, id ASC)`,
    );
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.events}_kind ON ${this.events} (kind, created_at DESC, id ASC)`,
    );
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.events}_pubkey_kind ON ${this.events} (pubkey, kind, created_at DESC, id ASC)`,
    );

    // Unique partial indexes enforce one stored version per replaceable /
    // addressable coordinate, so supersession is a primary-key style lookup.
    await this.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${this.events}_replaceable ON ${this.events} (kind, pubkey)
      WHERE kind = 0 OR kind = 3 OR (kind >= 10000 AND kind < 20000)
    `);
    await this.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${this.events}_addressable ON ${this.events} (kind, pubkey, d)
      WHERE kind >= 30000 AND kind < 40000
    `);

    // The tag table. The primary key drives tag lookups; the secondary index on
    // event_id is what makes deleting an event's tags a seek instead of a scan
    // — the price the relational design pays on every write.
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tags} (
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        event_id TEXT NOT NULL,
        PRIMARY KEY (name, value, event_id)
      ) WITHOUT ROWID
    `);
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.tags}_event_id ON ${this.tags} (event_id)`);
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /** Add an event to the store. */
  async event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    await this.transaction(async () => {
      if (await this.isDeleted(event)) {
        throw new RelayError('invalid', 'event deleted');
      }

      if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
        const conditions = ['kind = ?', 'pubkey = ?'];
        const params: NSQLiteValue[] = [event.kind, event.pubkey];

        if (NKinds.addressable(event.kind)) {
          conditions.push('d = ?');
          params.push(NSQLiteJoin.getDTag(event));
        }

        const [existing] = await this.all(
          `SELECT id, created_at FROM ${this.events}${where(conditions)}`,
          params,
        );

        if (existing) {
          const stored = { id: existing.id as string, created_at: Number(existing.created_at) };
          if (!NSQLiteJoin.isNewer(event, stored)) return;
          await this.deleteEvents([stored.id]);
        }
      }

      await this.insertEvent(event);

      if (event.kind === 5) {
        await this.applyDeletion(event);
      }
    });
  }

  /** Write the event row and its tag rows. */
  private async insertEvent(event: NostrEvent): Promise<void> {
    await this.run(
      `INSERT OR IGNORE INTO ${this.events} (id, kind, pubkey, created_at, d, json) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.kind,
        event.pubkey,
        event.created_at,
        NKinds.addressable(event.kind) ? NSQLiteJoin.getDTag(event) : null,
        JSON.stringify(event),
      ],
    );

    const rows = this.tagRows(event);
    if (rows.length === 0) return;

    const perStatement = Math.floor(MAX_PARAMS / 3);

    for (let i = 0; i < rows.length; i += perStatement) {
      const chunk = rows.slice(i, i + perStatement);
      const values = chunk.map(() => '(?, ?, ?)').join(', ');
      await this.run(
        `INSERT OR IGNORE INTO ${this.tags} (name, value, event_id) VALUES ${values}`,
        chunk.flat(),
      );
    }
  }

  /** The tag rows for an event: one per distinct `(name, value)` pair. */
  private tagRows(event: NostrEvent): NSQLiteValue[][] {
    const rows: NSQLiteValue[][] = [];
    const seen = new Set<string>();

    for (const [name, value] of this.indexTags(event)) {
      if (typeof name !== 'string' || typeof value !== 'string') continue;
      const key = `${name}\u0000${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([name, value, event.id]);
    }

    return rows;
  }

  /**
   * Whether a stored kind 5 has already deleted this event.
   *
   * The tag table carries no `kind` or `created_at`, so unlike {@link NSQLite}
   * this can't be answered from the tag index alone — it joins back to the
   * events table to check the request's kind, author, and timestamp.
   */
  private async isDeleted(event: NostrEvent): Promise<boolean> {
    // An `e` deletion applies to a specific id whenever it was issued; an `a`
    // deletion only covers versions at or before the request, so a newer
    // replacement is allowed back in.
    let target = `t.name = 'e' AND t.value = ?`;
    const params: NSQLiteValue[] = [event.id];

    if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
      target = `((t.name = 'e' AND t.value = ?) OR (t.name = 'a' AND t.value = ? AND e.created_at >= ?))`;
      params.push(NSQLiteJoin.getCoord(event), event.created_at);
    }

    const rows = await this.all(
      `SELECT 1 AS found FROM ${this.tags} t
       INNER JOIN ${this.events} e ON e.id = t.event_id
       WHERE ${target} AND e.kind = 5 AND e.pubkey = ?
       LIMIT 1`,
      [...params, event.pubkey],
    );

    return rows.length > 0;
  }

  /** NIP-09: delete the events a kind 5 request targets. */
  private async applyDeletion(request: NostrEvent): Promise<void> {
    const ids = new Set<string>();

    const eTags = request.tags.filter(([name, value]) => name === 'e' && !!value).map(([, value]) => value);
    const aTags = request.tags.filter(([name, value]) => name === 'a' && !!value).map(([, value]) => value);

    for (const chunk of batch(eTags, MAX_PARAMS - 1)) {
      const rows = await this.all(
        `SELECT id FROM ${this.events} WHERE ${memberOf('id', chunk)} AND pubkey = ?`,
        [...chunk, request.pubkey],
      );
      for (const row of rows) ids.add(row.id as string);
    }

    for (const coord of aTags) {
      const [kindStr, pubkey, ...rest] = coord.split(':');
      const kind = Number(kindStr);

      if (!Number.isInteger(kind) || pubkey !== request.pubkey) continue;

      const conditions = ['kind = ?', 'pubkey = ?', 'created_at <= ?'];
      const params: NSQLiteValue[] = [kind, pubkey, request.created_at];

      if (NKinds.addressable(kind)) {
        conditions.push('d = ?');
        params.push(rest.join(':'));
      }

      const rows = await this.all(`SELECT id FROM ${this.events}${where(conditions)}`, params);
      for (const row of rows) ids.add(row.id as string);
    }

    ids.delete(request.id);

    await this.deleteEvents([...ids]);
  }

  /**
   * Delete events by id, along with their tag rows.
   *
   * Tag rows go by `event_id`, which is what the secondary index on the tag
   * table exists for.
   */
  private async deleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    for (const chunk of batch(ids, MAX_PARAMS)) {
      await this.run(`DELETE FROM ${this.tags} WHERE ${memberOf('event_id', chunk)}`, chunk);
      await this.run(`DELETE FROM ${this.events} WHERE ${memberOf('id', chunk)}`, chunk);
    }
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  /** Query events matching the filters (OR'd together), newest-first. */
  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const byId = new Map<string, NostrEvent>();

    for (const filter of filters) {
      for (const event of await this.queryFilter(new ParsedFilter(filter), opts?.signal)) {
        byId.set(event.id, event);
      }
    }

    return [...byId.values()].sort(NSQLiteJoin.compareNewest);
  }

  private async queryFilter(filter: ParsedFilter, signal?: AbortSignal): Promise<NostrEvent[]> {
    if (filter.neverMatch) return [];

    const limit = filter.limit ?? Infinity;
    if (limit <= 0) return [];

    signal?.throwIfAborted();

    const queries = this.buildQueries(filter);

    // Without keywords the statement is the whole answer.
    if (!filter.searchKeywords) {
      const collected: NostrEvent[] = [];
      const seen = new Set<string>();

      for (const query of queries) {
        const params = [...query.params];
        let sql = `${query.sql} ORDER BY e.created_at DESC, e.id ASC`;

        if (limit !== Infinity) {
          sql += ' LIMIT ?';
          params.push(limit);
        }

        for (const row of await this.all(sql, params)) {
          const event: NostrEvent = JSON.parse(row.json as string);
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          collected.push(event);
        }
      }

      collected.sort(NSQLiteJoin.compareNewest);
      return collected.length > limit ? collected.slice(0, limit) : collected;
    }

    // Keywords have to be matched in memory, so page the statement by keyset
    // until the limit is met.
    const collected: NostrEvent[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      let after: { created_at: number; id: string } | undefined;

      while (collected.length < limit) {
        signal?.throwIfAborted();

        const conditions = [...query.conditions];
        const params = [...query.params];

        if (after) {
          conditions.push('e.created_at <= ?', '(e.created_at < ? OR e.id > ?)');
          params.push(after.created_at, after.created_at, after.id);
        }

        params.push(CHUNK_SIZE);

        const rows = await this.all(
          `${query.select}${where(conditions)} ORDER BY e.created_at DESC, e.id ASC LIMIT ?`,
          params,
        );

        if (rows.length === 0) break;

        for (const row of rows) {
          const event: NostrEvent = JSON.parse(row.json as string);
          after = { created_at: event.created_at, id: event.id };

          if (collected.length >= limit) break;
          if (seen.has(event.id)) continue;
          seen.add(event.id);

          if (filter.matches(event)) collected.push(event);
        }

        if (rows.length < CHUNK_SIZE) break;
      }
    }

    collected.sort(NSQLiteJoin.compareNewest);
    return collected;
  }

  /**
   * Build the statement(s) for a filter.
   *
   * Normally one: tag terms become `INNER JOIN`s, everything else a `WHERE`
   * clause. A filter whose value lists are too long for a single statement is
   * split, and the caller merges the parts.
   */
  private buildQueries(filter: ParsedFilter): BuiltQuery[] {
    const joins: string[] = [];
    const joinParams: NSQLiteValue[] = [];
    // A tag term matching several values can match one event more than once.
    let duplicates = false;

    filter.tags.forEach(({ name, values }, i) => {
      const alias = `t${i}`;
      joins.push(
        `INNER JOIN ${this.tags} ${alias} ON ${alias}.event_id = e.id AND ${alias}.name = ? AND ${
          memberOf(`${alias}.value`, values)
        }`,
      );
      joinParams.push(name, ...values);
      if (values.length > 1) duplicates = true;
    });

    const select = `SELECT ${duplicates ? 'DISTINCT ' : ''}e.created_at, e.id, e.json FROM ${this.events} e${
      joins.length ? ' ' + joins.join(' ') : ''
    }`;

    // Split the longest value list if the statement would exceed the parameter
    // budget. Splitting `ids` or `authors` keeps each part a valid filter.
    const idChunks = filter.ids ? [...batch(filter.ids, MAX_IN)] : [undefined];
    const authorChunks = filter.authors ? [...batch(filter.authors, MAX_IN)] : [undefined];

    const queries: BuiltQuery[] = [];

    for (const ids of idChunks) {
      for (const authors of authorChunks) {
        const conditions: string[] = [];
        const params: NSQLiteValue[] = [...joinParams];

        if (ids) {
          conditions.push(memberOf('e.id', ids));
          params.push(...ids);
        }
        if (authors) {
          conditions.push(memberOf('e.pubkey', authors));
          params.push(...authors);
        }
        if (filter.kinds) {
          conditions.push(memberOf('e.kind', filter.kinds));
          params.push(...filter.kinds);
        }
        if (filter.since !== undefined) {
          conditions.push('e.created_at >= ?');
          params.push(filter.since);
        }
        if (filter.until !== undefined) {
          conditions.push('e.created_at <= ?');
          params.push(filter.until);
        }

        queries.push({ select, conditions, params, sql: `${select}${where(conditions)}` });
      }
    }

    return queries;
  }

  /** COUNT support: the number of matching events. */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    if (filters.length === 1) {
      const filter = new ParsedFilter(filters[0]);
      if (filter.neverMatch) return { count: 0, approximate: false };

      if (filter.limit === undefined && !filter.searchKeywords) {
        const queries = this.buildQueries(filter);

        if (queries.length === 1) {
          const [query] = queries;
          const [row] = await this.all(`SELECT COUNT(*) AS count FROM (${query.sql})`, query.params);
          return { count: Number(row?.count ?? 0), approximate: false };
        }
      }
    }

    const events = await this.query(filters, opts);
    return { count: events.length, approximate: false };
  }

  /** Remove events matching the filters. */
  async remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    const events = await this.query(filters, opts);
    if (events.length === 0) return;

    await this.transaction(() => this.deleteEvents(events.map((event) => event.id)));
  }

  /** Close the underlying database connection, if the driver supports it. */
  async close(): Promise<void> {
    await this.db.close?.();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // ── Driver plumbing ───────────────────────────────────────────────────────

  private async run(sql: string, params: NSQLiteValue[] = []): Promise<void> {
    this.onQuery?.(sql, params);
    await this.db.run(sql, params);
  }

  private async all(sql: string, params: NSQLiteValue[] = []): Promise<Record<string, NSQLiteValue>[]> {
    this.onQuery?.(sql, params);
    return await this.db.all(sql, params);
  }

  private async exec(sql: string): Promise<void> {
    await this.run(sql.trim().replace(/\s+/g, ' '));
  }

  /** Run `fn` inside a transaction, queued behind any already in flight. */
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeLock.then(async () => {
      await this.run('BEGIN IMMEDIATE');

      try {
        const value = await fn();
        await this.run('COMMIT');
        return value;
      } catch (error) {
        await this.run('ROLLBACK');
        throw error;
      }
    });

    this.writeLock = result.catch(() => {});

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** The `d` tag value of an event (defaults to ""). */
  private static getDTag(event: NostrEvent): string {
    return event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  }

  /** The `kind:pubkey:d` coordinate of a replaceable or addressable event. */
  private static getCoord(event: NostrEvent): string {
    const d = NKinds.addressable(event.kind) ? NSQLiteJoin.getDTag(event) : '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }

  private static isNewer(a: { id: string; created_at: number }, b: { id: string; created_at: number }): boolean {
    if (a.created_at > b.created_at) return true;
    if (a.created_at < b.created_at) return false;
    return a.id < b.id;
  }

  private static compareNewest(a: NostrEvent, b: NostrEvent): number {
    if (a.created_at !== b.created_at) return b.created_at - a.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  [Symbol.toStringTag] = 'NSQLiteJoin';
}

/** A statement built from a filter, in the pieces the callers need. */
interface BuiltQuery {
  /** `SELECT … FROM events e [JOIN tags …]`, without a `WHERE`. */
  select: string;
  /** The `WHERE` conditions, so paging can append its own. */
  conditions: string[];
  params: NSQLiteValue[];
  /** `select` plus the `WHERE` clause, for callers that don't page. */
  sql: string;
}
