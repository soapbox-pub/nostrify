import { NKinds, RelayError } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter, NostrRelayCOUNT, NStore } from '@nostrify/types';

import type { NSQLiteDatabase, NSQLiteOpts, NSQLiteRow, NSQLiteValue } from './types.ts';
import { ParsedFilter } from './ParsedFilter.ts';
import { batch, memberOf, qs, where } from './sql.ts';
import { matchExpr, part, tagToken } from './tokens.ts';

// ============================================================================
// NSQLiteAuto — NSQLiteFTS's schema, minus the auxiliary tables, minus the
// hand-written scan.
//
// `NSQLiteFTS` decides in JavaScript which index to drive, forces it with
// `INDEXED BY`, and pages the result itself, widening the page when its
// conditions reject more rows than they keep. This one asks the same questions
// as a single statement per filter and lets SQLite answer them:
//
//     SELECT json FROM nostr_events
//      WHERE kind IN (…) AND pubkey IN (…)
//        AND seq IN (SELECT rowid FROM nostr_tags_fts WHERE nostr_tags_fts MATCH ?)
//        AND seq >= ? AND seq <= ?
//      ORDER BY seq DESC LIMIT ?
//
// Every constraint is a term the planner can choose to drive on or to test,
// and `ORDER BY seq DESC LIMIT ?` is the paging — one round trip, no cursor
// bookkeeping, no page-size heuristic.
//
// Two things make that plausible where they wouldn't be in `NSQLite`:
//
//   - The rowid still encodes `created_at` (see below), so *every* candidate
//     index is already in time order. Whichever one SQLite picks, it can walk
//     it backwards and stop at the limit — there is no plan that has to sort.
//   - Tag values cost one bound parameter no matter how many there are, since
//     they go into the MATCH string rather than an `IN` list.
//
// The auxiliary tables are gone with the same reasoning. `nostr_coords` was a
// table keyed by `kind:pubkey:d`; here that string is a column of the events
// table with a partial unique index over it, which is the same b-tree with the
// row it points at already attached. That deletes a table, a write per
// replaceable event, and — because deleting an event now takes its coordinate
// with it — the JSON re-parse `NSQLiteFTS.deleteEvents` needs to work out which
// coordinates to clean up.
//
// What can't become a column is tags: an event has many, and SQL has nowhere to
// put them. They stay in `nostr_tags_fts`, encoded exactly as in `NSQLiteFTS`.
//
// Storage layout:
//
//   nostr_events     the value store, keyed by the time-encoded `seq` rowid,
//                    with `coord` carrying the replaceable/addressable
//                    coordinate and b-tree indexes over `kind`, `pubkey`,
//                    `(pubkey, kind)` and `coord`.
//   nostr_tags_fts   one row per event: its tag tokens, plus `_p:<pubkey>` and,
//                    for deletion requests, `_d:`/`_c:` tokens naming what they
//                    delete.
//   nostr_events_fts NIP-50 search over `content`.
//
// Everything else — the rowid encoding, token encoding, replaceable
// supersession, NIP-09 deletion, write batching — is `NSQLiteFTS`'s, unchanged,
// so a benchmark between the two isolates the planner and the coordinate table.
// ============================================================================

/** Bits of the rowid reserved for the per-second sequence number. */
const SEQ_BITS = 20;

/** Rowids per second: how many events may share one `created_at`. */
const SEQ_SPACE = 2 ** SEQ_BITS;

/**
 * Largest `created_at` the rowid encoding can carry (2106-02-07). Beyond this
 * the timestamp is clamped, which keeps the rowid a safe integer at the cost of
 * ordering *among* absurdly-dated events; plans touching such an event re-check
 * `created_at` in SQL, so results stay correct either way.
 */
const MAX_TIME = 0xFFFFFFFF;

/** How many candidate rows a paged scan reads per round trip. */
const CHUNK_SIZE = 512;

/** Upper bound on bound parameters per statement, as in `NSQLite`. */
const MAX_PARAMS = 900;

/** Upper bound on the rows one page of a scan may read, however large the limit. */
const MAX_PAGE = 10_000;

/**
 * Most terms one MATCH expression may `OR` together. FTS5 opens an iterator per
 * term, so a very long list is split across statements and merged instead.
 */
const MAX_OR = 500;

/**
 * An `NStore` backed by SQLite that keeps everything but tags in one table and
 * leaves index selection to SQLite.
 *
 * The interface is identical to {@link NSQLite}; only the schema and the query
 * strategy differ.
 *
 * ```ts
 * import { DatabaseSync } from 'node:sqlite';
 * import { NSQLiteAuto } from '@nostrify/sqlite';
 *
 * const sqlite = new DatabaseSync('events.db');
 *
 * const store = new NSQLiteAuto({
 *   run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
 *   all: (sql, params = []) => sqlite.prepare(sql).all(...params),
 *   close: () => sqlite.close(),
 * });
 *
 * await store.migrate();
 * ```
 *
 * Requires an FTS5-enabled SQLite of at least 3.43 (2023), for contentless
 * tables that support deletion.
 */
export class NSQLiteAuto implements NStore {
  private readonly db: NSQLiteDatabase;
  private readonly indexTags: (event: NostrEvent) => string[][];
  private readonly onQuery?: (sql: string, params: NSQLiteValue[]) => void;

  /** Table names, resolved from the `tablePrefix` option. */
  private readonly events: string;
  private readonly tags: string;
  private readonly fts: string;

  /** Index names, resolved from the `tablePrefix` option. */
  private readonly idxPubkey: string;
  private readonly idxKind: string;
  private readonly idxPubkeyKind: string;
  private readonly idxCoord: string;

  /** Events queued by {@link event}, awaiting the next batched commit. */
  private pending: PendingWrite[] = [];
  /** Whether a flush is already scheduled for the current burst. */
  private flushScheduled = false;
  /** Tail of the write chain, so transactions queue rather than interleave. */
  private writeLock: Promise<unknown> = Promise.resolve();

  constructor(db: NSQLiteDatabase, opts: NSQLiteOpts = {}) {
    const prefix = opts.tablePrefix ?? 'nostr';

    this.db = db;
    this.indexTags = opts.indexTags ?? NSQLiteAuto.indexTags;
    this.onQuery = opts.onQuery;

    this.events = `${prefix}_events`;
    this.tags = `${prefix}_tags_fts`;
    this.fts = `${prefix}_events_fts`;

    this.idxPubkey = `${this.events}_pubkey`;
    this.idxKind = `${this.events}_kind`;
    this.idxPubkeyKind = `${this.events}_pubkey_kind`;
    this.idxCoord = `${this.events}_coord`;
  }

  /** Default tag index policy, identical to `NSQLite.indexTags`. */
  static indexTags(event: NostrEvent): string[][] {
    return event.tags.filter(([name, value]) => name.length === 1 && !!value && value.length < 200);
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  /** Create the tables, indexes and triggers this store needs, if absent. */
  async migrate(): Promise<void> {
    // `seq` is the rowid, and encodes `created_at`, so the table is stored in
    // time order and needs no separate index to be read newest-first. `coord`
    // is the replaceable/addressable coordinate, and null for every other kind.
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.events} (
        seq INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        kind INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        coord TEXT,
        json TEXT NOT NULL
      )
    `);

    // SQLite appends the rowid to every index entry, and the rowid is time, so
    // these are already `(…, created_at)` indexes — whichever one the planner
    // picks, it can walk it backwards for newest-first with no sorter.
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxKind} ON ${this.events} (kind)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxPubkey} ON ${this.events} (pubkey)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxPubkeyKind} ON ${this.events} (pubkey, kind)`);

    // Partial, so the index holds one entry per replaceable event rather than
    // one per event — and unique, because a coordinate having one live version
    // is the invariant the write path exists to maintain.
    await this.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.idxCoord} ON ${this.events} (coord) WHERE coord IS NOT NULL`,
    );

    // The tag index, exactly as in `NSQLiteFTS`: one row per event, holding its
    // tag tokens plus a `_p:` token for its author.
    await this.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tags} USING fts5(
        tokens,
        tokenize = 'ascii tokenchars '':_''',
        content = '',
        contentless_delete = 1,
        detail = none
      )
    `);

    // NIP-50 search, tokenized for prose rather than for opaque tokens.
    await this.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.fts}
      USING fts5(content, tokenize = 'unicode61 remove_diacritics 2', content = '', contentless_delete = 1)
    `);

    // Every commit leaves behind a segment, and a query with N terms opens an
    // iterator per term *per segment*, so a store written an event at a time
    // answers a multi-term filter several times slower than a bulk-loaded one.
    // Turning `automerge` down to its minimum folds more merging into each
    // write, which measured free on the write side and several times faster on
    // many-term reads.
    await this.exec(`INSERT INTO ${this.tags}(${this.tags}, rank) VALUES('automerge', 2)`);
    await this.exec(`INSERT INTO ${this.fts}(${this.fts}, rank) VALUES('automerge', 2)`);

    // The search index is maintained by triggers — its content is a field of
    // the event, so SQLite can read it out of the stored JSON without a round
    // trip. The token index can only be kept in step on delete this way, since
    // its tokens depend on the `indexTags` policy, which lives in JavaScript.
    await this.exec(`
      CREATE TRIGGER IF NOT EXISTS ${this.events}_fts_insert AFTER INSERT ON ${this.events} BEGIN
        INSERT INTO ${this.fts} (rowid, content) VALUES (new.seq, json_extract(new.json, '$.content'));
      END
    `);
    await this.exec(`
      CREATE TRIGGER IF NOT EXISTS ${this.events}_fts_delete AFTER DELETE ON ${this.events} BEGIN
        DELETE FROM ${this.tags} WHERE rowid = old.seq;
        DELETE FROM ${this.fts} WHERE rowid = old.seq;
      END
    `);
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Add an event to the store. Semantics are `NSQLite`'s exactly: ephemeral
   * events are dropped, replaceable/addressable events supersede older versions
   * at their coordinate, kind 5 requests delete what they target, and an event
   * a stored request has already deleted is rejected.
   */
  event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.pending.push({ event, resolve, reject });
      this.scheduleFlush();
    });
  }

  /** Schedule a flush for the events queued so far (see `NSQLite`). */
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;

    queueMicrotask(() => {
      this.flushScheduled = false;
      void this.flushWrites();
    });
  }

  /** Commit every queued event in one transaction, then settle their callers. */
  private async flushWrites(): Promise<void> {
    const batch = this.pending;
    if (batch.length === 0) return;

    this.pending = [];

    const rejections = new Map<PendingWrite, unknown>();

    try {
      await this.transaction(async () => {
        for (const item of batch) {
          try {
            await this.writeEvent(item.event);
          } catch (error) {
            if (error instanceof RelayError) {
              rejections.set(item, error);
              continue;
            }
            throw error;
          }
        }
      });
    } catch (error) {
      for (const item of batch) item.reject(error);
      return;
    }

    for (const item of batch) {
      const rejection = rejections.get(item);
      if (rejection) item.reject(rejection);
      else item.resolve();
    }
  }

  /** Apply a single event's writes. Runs inside the batch transaction. */
  private async writeEvent(event: NostrEvent): Promise<void> {
    const check = await this.check(event);

    if (check.deleted) {
      throw new RelayError('invalid', 'event deleted');
    }

    // Already stored: a re-delivered event is a no-op.
    if (check.existing !== undefined) return;

    const coord = NKinds.replaceable(event.kind) || NKinds.addressable(event.kind) ? NSQLiteAuto.getCoord(event) : null;

    if (coord !== null) {
      const [existing] = await this.all(
        `SELECT id, seq, created_at FROM ${this.events} WHERE coord = ?`,
        [coord],
      );

      if (existing) {
        const stored = { id: existing.id as string, created_at: Number(existing.created_at) };
        // Per NIP-01 the stored version wins ties, so only a strictly newer
        // event replaces it.
        if (!NSQLiteAuto.isNewer(event, stored)) return;
        // Deleted before the insert, since the coordinate index is unique.
        await this.deleteEvents([Number(existing.seq)]);
      }
    }

    await this.insertEvent(event, check.seq, coord);

    // Applied after the insert so a kind 5 arriving alongside its targets in
    // the same session still resolves. The request itself is retained.
    if (event.kind === 5) {
      await this.applyDeletion(event);
    }
  }

  /**
   * Everything a write needs to know before it starts, in one round trip: the
   * rowid of this event if it is already stored, the rowid of a deletion
   * request that names it, and the next free rowid at its timestamp.
   *
   * The rowid is allocated by looking, rather than from a counter held in
   * memory, so two processes writing to the same database can't hand out the
   * same one.
   */
  private async check(event: NostrEvent): Promise<{ existing?: number; deleted: boolean; seq: number }> {
    const base = NSQLiteAuto.bucket(event.created_at);
    const replaceable = NKinds.replaceable(event.kind) || NKinds.addressable(event.kind);

    const terms = [
      `(SELECT seq FROM ${this.events} WHERE id = ?) AS existing`,
      `(SELECT MAX(seq) FROM ${this.events} WHERE seq >= ? AND seq < ?) AS last`,
      `(SELECT rowid FROM ${this.tags} WHERE ${this.tags} MATCH ? LIMIT 1) AS deleted`,
    ];

    const params: NSQLiteValue[] = [
      event.id,
      base,
      base + SEQ_SPACE,
      `"_d:${part(event.id)}"`,
    ];

    // `e` deletions apply to an id whenever they were issued; `a` deletions
    // only to versions at or before the request, so a newer replacement of a
    // coordinate is allowed back in.
    if (replaceable) {
      terms.push(
        `(SELECT rowid FROM ${this.tags} WHERE ${this.tags} MATCH ? AND rowid >= ? LIMIT 1) AS superseded`,
      );
      params.push(`"_c:${part(NSQLiteAuto.getCoord(event))}"`, base);
    }

    const [row] = await this.all(`SELECT ${terms.join(', ')}`, params);

    const requests = [row?.deleted, row?.superseded]
      .filter((value) => value !== null && value !== undefined)
      .map(Number);

    const seq = row?.last === null || row?.last === undefined ? base : Number(row.last) + 1;

    // One second may hold 2²⁰ events. A relay that manages more of them at the
    // same timestamp has outgrown this encoding, and silently reordering its
    // events would be worse than saying so.
    if (seq >= base + SEQ_SPACE) {
      throw new RelayError('error', 'too many events at this timestamp');
    }

    return {
      existing: row?.existing === null || row?.existing === undefined ? undefined : Number(row.existing),
      // Only the event's own author can delete it, so a request that names it
      // still has to be resolved to its pubkey — a second round trip, but only
      // on the vanishingly rare occasion that there is one.
      deleted: requests.length > 0 && await this.authored(requests, event.pubkey),
      seq,
    };
  }

  /** Whether any of these events was written by `pubkey`. */
  private async authored(seqs: number[], pubkey: string): Promise<boolean> {
    const rows = await this.all(
      `SELECT 1 AS found FROM ${this.events} WHERE seq IN (${qs(seqs.length)}) AND pubkey = ? LIMIT 1`,
      [...seqs, pubkey],
    );

    return rows.length > 0;
  }

  /**
   * Write the event row and its token index row.
   *
   * The search index is written by a trigger and the coordinate is a column of
   * the row, so a new event costs exactly two statements however many indexes
   * it lands in.
   */
  private async insertEvent(event: NostrEvent, seq: number, coord: string | null): Promise<void> {
    await this.run(
      `INSERT INTO ${this.events} (seq, id, kind, pubkey, created_at, coord, json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [seq, event.id, event.kind, event.pubkey, event.created_at, coord, JSON.stringify(event)],
    );

    await this.run(
      `INSERT INTO ${this.tags} (rowid, tokens) VALUES (?, ?)`,
      [seq, this.tagTokens(event)],
    );
  }

  /**
   * An event's index terms as a single space-separated token string: its
   * indexed tags, plus `_p:<pubkey>` so an author constraint can be merged
   * into the same MATCH as the tags.
   */
  private tagTokens(event: NostrEvent): string {
    const tokens: string[] = [`_p:${part(event.pubkey)}`];
    const seen = new Set<string>();

    for (const [name, value] of this.indexTags(event)) {
      if (typeof name !== 'string' || typeof value !== 'string') continue;
      const token = tagToken(name, value);
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }

    // What a deletion request deletes, indexed under its own prefix, so that
    // "has anything already deleted this event?" — the one question asked on
    // every single write — is a single term rather than an intersection with
    // `_k:5`.
    if (event.kind === 5) {
      for (const [name, value] of event.tags) {
        if (typeof value !== 'string' || !value) continue;
        if (name === 'e') tokens.push(`_d:${part(value)}`);
        else if (name === 'a') tokens.push(`_c:${part(value)}`);
      }
    }

    return tokens.join(' ');
  }

  /** NIP-09: delete the events a kind 5 request targets. */
  private async applyDeletion(request: NostrEvent): Promise<void> {
    const seqs = new Set<number>();

    const targets = request.tags.filter(([name, value]) => (name === 'e' || name === 'a') && !!value);
    if (targets.length === 0) return;

    // A request can't delete itself, and a kind 5 occupies no coordinate, so
    // dropping its own id from the `e` targets is the whole of that rule.
    const eTags = targets.filter(([name, value]) => name === 'e' && value !== request.id).map(([, value]) => value);
    const aTags = targets.filter(([name]) => name === 'a').map(([, value]) => value);

    for (const chunk of batch(eTags, MAX_PARAMS - 1)) {
      const rows = await this.all(
        `SELECT seq FROM ${this.events} WHERE id IN (${qs(chunk.length)}) AND pubkey = ?`,
        [...chunk, request.pubkey],
      );
      for (const row of rows) seqs.add(Number(row.seq));
    }

    const owned = aTags.filter((coord) => coord.split(':')[1] === request.pubkey);

    // The coordinate is a column of the events table now, so the versions a
    // request may delete are found without a second table to consult.
    for (const chunk of batch(owned, MAX_PARAMS - 1)) {
      const rows = await this.all(
        `SELECT seq FROM ${this.events} WHERE coord IN (${qs(chunk.length)}) AND created_at <= ?`,
        [...chunk, request.created_at],
      );
      for (const row of rows) seqs.add(Number(row.seq));
    }

    await this.deleteEvents([...seqs]);
  }

  /**
   * Delete events by rowid.
   *
   * One statement, whatever the events were: the token and search index rows go
   * with them by trigger, and the coordinate goes with them because it is a
   * column of the row rather than a table keyed by it. `NSQLiteFTS` has to read
   * every row back and parse its JSON here, to work out which coordinates to
   * clean up.
   */
  private async deleteEvents(seqs: number[]): Promise<void> {
    if (seqs.length === 0) return;

    for (const chunk of batch(seqs, MAX_PARAMS)) {
      await this.run(`DELETE FROM ${this.events} WHERE seq IN (${qs(chunk.length)})`, chunk);
    }
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  /**
   * Query events matching the filters (OR'd together), newest-first,
   * de-duplicated by id, each filter's `limit` respected.
   */
  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const byId = new Map<string, NostrEvent>();

    for (const filter of filters) {
      for (const event of await this.queryFilter(new ParsedFilter(filter), opts?.signal)) {
        byId.set(event.id, event);
      }
    }

    return [...byId.values()].sort(NSQLiteAuto.compareNewest);
  }

  /** Run a single parsed filter. */
  private async queryFilter(filter: ParsedFilter, signal?: AbortSignal): Promise<NostrEvent[]> {
    if (filter.neverMatch) return [];

    const limit = filter.limit ?? Infinity;
    if (limit <= 0) return [];

    signal?.throwIfAborted();

    const plan = this.plan(filter);

    // The whole point of the design: one statement, ordered and limited by
    // SQLite, read straight into the answer.
    if (plan.complete && plan.statements.length === 1) {
      const { sql, params } = this.statement(plan, plan.statements[0], undefined, limit, false);
      const rows = await this.all(sql, params);
      return rows.map((row) => JSON.parse(row.json as string) as NostrEvent);
    }

    // A filter too wide for one statement is split into several, each of them
    // complete for its share of the values. Chunks partition an `OR` list, so
    // the union of their answers is the filter's — de-duplicated, since an
    // event with two matching tags can appear in two tag chunks.
    if (plan.complete) {
      const byId = new Map<string, NostrEvent>();

      for (const statement of plan.statements) {
        signal?.throwIfAborted();

        const { sql, params } = this.statement(plan, statement, undefined, limit, false);
        for (const row of await this.all(sql, params)) {
          const event = JSON.parse(row.json as string) as NostrEvent;
          byId.set(event.id, event);
        }
      }

      const events = [...byId.values()].sort(NSQLiteAuto.compareNewest);
      return events.length > limit ? events.slice(0, limit) : events;
    }

    return await this.pagedScan(plan, filter, limit, signal);
  }

  /**
   * The fallback for a filter SQL can't express in full — a search that is
   * nothing but negations, or so many bound values that a constraint had to be
   * left out to fit. Rows are read in pages and finished in memory.
   */
  private async pagedScan(
    plan: Plan,
    filter: ParsedFilter,
    limit: number,
    signal?: AbortSignal,
  ): Promise<NostrEvent[]> {
    const collected: NostrEvent[] = [];
    const seen = new Set<string>();

    let before: number | undefined;
    let pageSize = CHUNK_SIZE;

    while (collected.length < limit) {
      signal?.throwIfAborted();

      const page: Candidate[] = [];
      let exhausted = true;

      for (const statement of plan.statements) {
        const { sql, params } = this.statement(plan, statement, before, pageSize, true);
        const rows = await this.all(sql, params);

        if (rows.length >= pageSize) exhausted = false;

        for (const row of rows) {
          page.push({ seq: Number(row.seq), event: JSON.parse(row.json as string) as NostrEvent });
        }
      }

      if (page.length === 0) break;

      page.sort((a, b) => b.seq - a.seq);
      const rows = page.slice(0, pageSize);

      before = rows[rows.length - 1].seq;

      for (const { event } of rows) {
        if (collected.length >= limit) break;
        if (seen.has(event.id)) continue;
        seen.add(event.id);

        if (filter.matches(event, plan.searched)) collected.push(event);
      }

      if (exhausted) break;

      // Still short of the limit after a full page, so the in-memory conditions
      // are rejecting more than they keep. Widening geometrically bounds the
      // number of round trips a very selective filter costs.
      pageSize = Math.min(pageSize * 4, MAX_PAGE);
    }

    collected.sort(NSQLiteAuto.compareNewest);
    return collected;
  }

  /**
   * One statement: every constraint as a `WHERE` term over the events table,
   * ordered and limited by `seq`.
   *
   * No index is named. Each of `id`, `kind`, `pubkey`, `(pubkey, kind)` and the
   * table itself is in time order — the rowid is the timestamp — so whichever
   * one SQLite chooses satisfies `ORDER BY seq DESC` by walking it backwards,
   * and the `LIMIT` stops it. The tag and search constraints are subqueries
   * over their FTS5 indexes, which the planner may drive on or probe.
   */
  private statement(
    plan: Plan,
    values: ValueSet,
    before: number | undefined,
    limit: number,
    keys: boolean,
  ): { sql: string; params: NSQLiteValue[] } {
    const { driver, key, conditions, params } = this.terms(plan, values, before);

    const from = driver ? `${driver} JOIN ${this.events} e ON e.seq = ${driver}.rowid` : `${this.events} e`;

    // The key is only read when a later page has to resume from it; a statement
    // that answers the whole query leaves the column out.
    const sql = `SELECT ${keys ? `${key} AS seq, ` : ''}e.json FROM ${from}${where(conditions)} ORDER BY ${key} DESC${
      Number.isFinite(limit) ? ' LIMIT ?' : ''
    }`;

    if (Number.isFinite(limit)) params.push(limit);

    return { sql, params };
  }

  /**
   * The same conditions, counted rather than returned.
   *
   * When nothing constrains the events row, the driving index knows the answer
   * by itself — one event is one row of it, however many of its tags matched,
   * so there is nothing to de-duplicate and no event body to read.
   */
  private countStatement(plan: Plan, values: ValueSet): { sql: string; params: NSQLiteValue[] } {
    const { driver, conditions, params, joined } = this.terms(plan, values, undefined);

    const from = driver
      ? (joined ? `${driver} JOIN ${this.events} e ON e.seq = ${driver}.rowid` : driver)
      : `${this.events} e`;

    return { sql: `SELECT COUNT(*) AS count FROM ${from}${where(conditions)}`, params };
  }

  /**
   * Every condition a filter puts on one statement, and which index the scan is
   * expressed in terms of.
   *
   * Tokens drive whenever the filter names a tag, since that index carries the
   * author and the ordering too; a keyword-only filter drives the search index
   * the same way. No index is *forced* — the join leaves SQLite free to start
   * from the events table instead — but writing the match as a join rather than
   * an `IN (SELECT …)` is what gives it the choice at all. As a subquery, the
   * rowids are a list to materialize in full and probe; as a join, FTS5 is
   * handed the descending order and the limit, and stops as soon as it has
   * enough rows.
   */
  private terms(
    plan: Plan,
    values: ValueSet,
    before: number | undefined,
  ): { driver?: string; key: string; conditions: string[]; params: NSQLiteValue[]; joined: boolean } {
    const conditions: string[] = [];
    const params: NSQLiteValue[] = [];

    const driver = values.match !== undefined ? this.tags : plan.search !== undefined ? this.fts : undefined;

    // Whether any condition reaches into the events row, which is what decides
    // if the join is needed at all.
    let joined = !driver;

    if (values.match !== undefined) {
      conditions.push(`${this.tags} MATCH ?`);
      params.push(values.match);

      // Keywords alongside tokens are a second index, and FTS5 can't merge two
      // of them, so they become a filter over the driving scan. The `+` is
      // load-bearing: without it SQLite hands the rowid list to the token index
      // as a constraint, turning one descending scan into one scan per keyword
      // match; with it, the list stays an ordinary filter and SQLite builds a
      // bloom filter for it.
      if (plan.search !== undefined) {
        conditions.push(`+${this.tags}.rowid IN (SELECT rowid FROM ${this.fts} WHERE ${this.fts} MATCH ?)`);
        params.push(plan.search);
      }
    } else if (plan.search !== undefined) {
      conditions.push(`${this.fts} MATCH ?`);
      params.push(plan.search);
    }

    if (values.ids) {
      conditions.push(memberOf('e.id', values.ids));
      params.push(...values.ids);
      joined = true;
    }
    if (values.authors) {
      conditions.push(memberOf('e.pubkey', values.authors));
      params.push(...values.authors);
      joined = true;
    }
    if (values.kinds) {
      conditions.push(memberOf('e.kind', values.kinds));
      params.push(...values.kinds);
      joined = true;
    }

    // The driving index's rowid, so the time bounds and the ordering are pushed
    // into the scan rather than applied after it.
    const key = driver ? `${driver}.rowid` : 'e.seq';

    // The rowid bound is what lets a scan stop early; the `created_at` test is
    // what makes it exact, for the timestamps the encoding had to clamp.
    if (plan.min !== undefined) {
      conditions.push(`${key} >= ?`);
      params.push(plan.min);
    }
    if (plan.max !== undefined) {
      conditions.push(`${key} <= ?`);
      params.push(plan.max);
    }
    if (!plan.exact && plan.since !== undefined) {
      conditions.push('e.created_at >= ?');
      params.push(plan.since);
      joined = true;
    }
    if (!plan.exact && plan.until !== undefined) {
      conditions.push('e.created_at <= ?');
      params.push(plan.until);
      joined = true;
    }

    if (before !== undefined) {
      conditions.push(`${key} < ?`);
      params.push(before);
    }

    return { driver, key, conditions, params, joined };
  }

  /**
   * Turn a filter into the statements that answer it.
   *
   * Normally one. A filter is only split when it names more values than a
   * statement can bind, or more tag values than FTS5 wants iterators for.
   */
  private plan(filter: ParsedFilter): Plan {
    const { min, max, exact } = this.timeRange(filter);

    // A search whose keywords are all negations has nothing for FTS5 to match
    // against — there is no way to say "every row except these" — so it is left
    // to the in-memory matcher.
    const searched = !filter.searchKeywords || !!filter.searchQuery;

    const groups = filter.tags.map((tag) => tag.values.map((value) => tagToken(tag.name, value)));

    // Authors join the tags in the index, where they are one more posting list
    // to intersect — the token index carries a `_p:` token for every event's
    // author precisely so a filter naming both is a single lookup. Without a
    // tag to intersect *with*, they are better served by their own b-tree, so
    // they only move into the index when there is one.
    const inIndex = groups.length > 0 && !!filter.authors && filter.authors.length <= MAX_OR;

    if (inIndex) {
      groups.push(filter.authors!.map((pubkey) => `_p:${part(pubkey)}`));
    }

    // Tag values cost one bound parameter however many there are, since they go
    // into the MATCH string. FTS5 still opens an iterator per term, though, so
    // the longest group is split — the longest because every statement carries
    // every other group in full, and splitting a short one repeats more work.
    const longest = groups.reduce((a, b) => (b.length > a.length ? b : a), groups[0] ?? []);
    const chunks = longest.length > MAX_OR ? [...batch(longest, MAX_OR)] : [longest];

    const matches: (string | undefined)[] = groups.length === 0
      ? [undefined]
      : chunks.map((chunk) => matchExpr(groups.map((group) => (group === longest ? chunk : group))));

    const { sets, complete } = this.splitValues(filter, inIndex);

    const statements: ValueSet[] = [];
    for (const match of matches) {
      for (const set of sets) {
        statements.push({ ...set, match });
      }
    }

    return {
      statements,
      complete: complete && searched,
      searched,
      search: filter.searchQuery,
      since: filter.since,
      until: filter.until,
      min,
      max,
      exact,
    };
  }

  /**
   * Divide `ids`/`authors`/`kinds` into sets that fit a statement's parameter
   * budget.
   *
   * Chunking one of them is lossless: an event has one id, one pubkey and one
   * kind, so it satisfies exactly one chunk, and the chunks' answers are
   * disjoint. Only when the *other* constraints alone overflow the budget does
   * anything have to be shed to the in-memory matcher — which takes a filter
   * naming a thousand values in two different constraints at once.
   */
  private splitValues(filter: ParsedFilter, inIndex: boolean): { sets: ValueSet[]; complete: boolean } {
    const budget = MAX_PARAMS - 8;

    let ids = filter.ids;
    // Authors the MATCH expression already carries cost nothing here, and
    // binding them again would only make SQLite check what the index proved.
    let authors = inIndex ? undefined : filter.authors;
    let kinds = filter.kinds;
    let complete = true;

    for (;;) {
      const present: Entry[] = [];
      if (ids) present.push({ key: 'ids', values: ids });
      if (authors) present.push({ key: 'authors', values: authors });
      if (kinds) present.push({ key: 'kinds', values: kinds });

      if (present.length === 0) return { sets: [{ ids, authors, kinds }], complete };

      const longest = present.reduce((a, b) => (b.values.length > a.values.length ? b : a));
      const others = present.reduce((total, entry) => total + (entry === longest ? 0 : entry.values.length), 0);

      if (others < budget) {
        const room = budget - others;
        if (longest.values.length <= room) return { sets: [{ ids, authors, kinds }], complete };

        const values: (string | number)[] = longest.values;

        const sets = [...batch(values, room)].map((chunk): ValueSet => ({
          ids: longest.key === 'ids' ? chunk as string[] : ids,
          authors: longest.key === 'authors' ? chunk as string[] : authors,
          kinds: longest.key === 'kinds' ? chunk as number[] : kinds,
        }));

        return { sets, complete };
      }

      // Even without the longest, the rest overflow: shed the largest of them.
      const shed = present
        .filter((entry) => entry !== longest)
        .reduce((a, b) => (b.values.length > a.values.length ? b : a));

      if (shed.key === 'ids') ids = undefined;
      else if (shed.key === 'authors') authors = undefined;
      else kinds = undefined;

      complete = false;
    }
  }

  /**
   * The rowid window a filter's `since`/`until` bounds describe, and whether
   * that window is exact — it isn't when a bound falls outside the range the
   * rowid encoding can represent, in which case `created_at` is tested too.
   */
  private timeRange(filter: ParsedFilter): { min?: number; max?: number; exact: boolean } {
    let exact = true;
    let min: number | undefined;
    let max: number | undefined;

    if (filter.since !== undefined) {
      if (filter.since > MAX_TIME || filter.since < 0) exact = false;
      min = NSQLiteAuto.bucket(filter.since);
    }

    if (filter.until !== undefined) {
      if (filter.until > MAX_TIME || filter.until < 0) exact = false;
      max = NSQLiteAuto.bucket(filter.until) + SEQ_SPACE - 1;
    }

    return { min, max, exact };
  }

  /** COUNT support: the number of matching events. */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    // A single complete statement can be counted without returning a row or
    // parsing an event. Several statements can't: their tag chunks overlap, so
    // an event could be counted twice.
    if (filters.length === 1) {
      const filter = new ParsedFilter(filters[0]);
      if (filter.neverMatch) return { count: 0, approximate: false };

      if (filter.limit === undefined) {
        const plan = this.plan(filter);

        if (plan.complete && plan.statements.length === 1) {
          const { sql, params } = this.countStatement(plan, plan.statements[0]);
          const [row] = await this.all(sql, params);
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

    await this.transaction(async () => {
      const seqs: number[] = [];

      for (const chunk of batch(events.map((event) => event.id), MAX_PARAMS)) {
        const rows = await this.all(
          `SELECT seq FROM ${this.events} WHERE id IN (${qs(chunk.length)})`,
          chunk,
        );
        for (const row of rows) seqs.push(Number(row.seq));
      }

      await this.deleteEvents(seqs);
    });
  }

  /**
   * Refresh the statistics SQLite's planner uses to choose an index.
   *
   * This store names no index, which is what lets a filter be one statement —
   * but with no statistics SQLite chooses by rule, and one of its rules is
   * badly wrong here. Given `authors` and `kinds` it takes the `pubkey` index,
   * because that one is already in `seq` order and so answers `ORDER BY seq
   * DESC LIMIT ?` with no sort. The bet is that the limit fills quickly. For a
   * prolific author and a rare kind — a profile, a relay list — it never fills,
   * and the scan reads every event that author ever wrote: measured 500x slower
   * than the composite index on a 200k-event store.
   *
   * Given statistics, the planner sees that `(pubkey, kind)` narrows to a
   * handful of rows and accepts the sort. So the index hints the other stores
   * hard-code are not really a disagreement with the planner — they are a
   * substitute for measurements it was never given.
   *
   * `PRAGMA optimize` only re-analyzes what has changed enough to matter, so it
   * is cheap to call periodically, and it is called on {@link close}.
   */
  async optimize(): Promise<void> {
    await this.run('PRAGMA optimize');
  }

  /** Close the underlying database connection, if the driver supports it. */
  async close(): Promise<void> {
    // A read-only or already-failed connection can't analyze; that is no reason
    // to fail the close.
    try {
      await this.optimize();
    } catch {
      // ignore
    }

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

  private async all(sql: string, params: NSQLiteValue[] = []): Promise<NSQLiteRow[]> {
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

  /** The first rowid belonging to a timestamp, clamped to the encodable range. */
  private static bucket(created_at: number): number {
    const time = Math.min(Math.max(Math.floor(created_at), 0), MAX_TIME);
    return time * SEQ_SPACE;
  }

  /** The `kind:pubkey:d` coordinate of a replaceable or addressable event. */
  private static getCoord(event: NostrEvent): string {
    const d = NKinds.addressable(event.kind) ? event.tags.find(([name]) => name === 'd')?.[1] ?? '' : '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }

  /** Per NIP-01, newer means a greater created_at, or a smaller id on a tie. */
  private static isNewer(a: { id: string; created_at: number }, b: { id: string; created_at: number }): boolean {
    if (a.created_at > b.created_at) return true;
    if (a.created_at < b.created_at) return false;
    return a.id < b.id;
  }

  /** Comparator that orders events newest-first (ties: smaller id first). */
  private static compareNewest(a: NostrEvent, b: NostrEvent): number {
    if (a.created_at !== b.created_at) return b.created_at - a.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  [Symbol.toStringTag] = 'NSQLiteAuto';
}

/** An event queued for the next batched commit, with its caller's settlers. */
interface PendingWrite {
  event: NostrEvent;
  resolve(): void;
  reject(error: unknown): void;
}

/** A row a paged scan produced: its rowid, and the event. */
interface Candidate {
  seq: number;
  event: NostrEvent;
}

/** One statement's share of the filter's value constraints. */
interface ValueSet {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  /** The FTS5 MATCH expression over tag tokens, if the filter names any. */
  match?: string;
}

/** A constraint being considered for splitting. */
type Entry =
  | { key: 'ids'; values: string[] }
  | { key: 'authors'; values: string[] }
  | { key: 'kinds'; values: number[] };

/** How to answer one filter. */
interface Plan {
  /** Usually one. Several when the filter names more values than one can bind. */
  statements: ValueSet[];
  /** Whether the statements express the filter completely. */
  complete: boolean;
  /** Whether the plan applies the filter's NIP-50 keywords itself. */
  searched: boolean;
  /** Conditions shared by every statement. */
  search?: string;
  since?: number;
  until?: number;
  min?: number;
  max?: number;
  exact: boolean;
}
