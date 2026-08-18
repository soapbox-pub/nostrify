import { NKinds, RelayError } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter, NostrRelayCOUNT, NStore } from '@nostrify/types';

import type { NSQLiteDatabase, NSQLiteOpts, NSQLiteRow, NSQLiteValue } from './types.ts';
import { ParsedFilter } from './ParsedFilter.ts';
import { batch, memberOf, qs, tuples, where } from './sql.ts';
import { matchExpr, part, phrase, tagToken } from './tokens.ts';

// ============================================================================
// NSQLite — an `NStore` whose tag index is an FTS5 inverted index.
//
// There is no tags table. An event's tags are flattened into a string of opaque
// tokens — `e:<id>`, `p:<pubkey>`, `t:nostr` — and handed to FTS5, whose
// tokenizer is configured so that each one is a single indivisible token.
// `{"#e": [id]}` then becomes a full-text match for the word `e:<id>`.
//
// The bet is that a posting list is a better fit for Nostr's tag filters than a
// b-tree is. Measured against two b-tree implementations of this same
// interface — one a hand-planned `(name, value, created_at DESC, id)` covering
// table, the other a conventional tags table joined by SQLite — it holds:
//
//   - A tag filter is a boolean expression over terms, which is exactly what an
//     FTS5 query *is*. `{"#t": [a, b], "#p": [c]}` is one MATCH —
//     `(t:a OR t:b) AND p:c` — intersected by merging sorted posting lists in
//     C. A b-tree can drive on only one term and must intersect the rest in the
//     application, or hand the whole thing to SQLite's join planner and hope.
//     At 200k events that filter took 63ms the first way and 108ms the second,
//     against 0.4ms here.
//   - Posting lists are delta-encoded varints, so an indexed tag costs a byte
//     or two per event rather than a whole b-tree entry. An event with 300 tags
//     is one insert of one row, not 300 index inserts.
//   - One event is one row of the index, so a filter that matches an event
//     through several of its tags yields it once. No DISTINCT, no
//     de-duplication pass.
//
// The catch is ordering. Nostr wants newest-first with a small limit; FTS5 only
// ever yields rows in rowid order. That's fine — *if* rowid order is time
// order, which is arranged by construction:
//
//     rowid = created_at × 2²⁰ + a per-second sequence number
//
// so `ORDER BY rowid DESC` is `ORDER BY created_at DESC`, and FTS5 does it by
// walking its posting lists backwards, with no sorter. `since`/`until` become a
// rowid range, which FTS5 pushes down into that walk. Terms, ordering, time
// window and limit are then one statement that stops as soon as it has enough
// rows.
//
// The same encoding pays off outside the index. The events table is *clustered*
// by time, so:
//
//   - the `created_at DESC` index the other designs need is the table itself;
//   - `(kind)` and `(pubkey)` are implicitly `(kind, created_at)` and
//     `(pubkey, created_at)`, since SQLite appends the rowid to every index
//     entry — narrower keys than spelling `created_at DESC, id ASC` out;
//   - a candidate key is one integer, and reading its event is a seek into the
//     table b-tree rather than into a 64-character text index.
//
// What the index does *not* carry is as deliberate as what it does. A posting
// list is only worth intersecting when it's short, and in descending order FTS5
// reads a term's list in full — so a term matching a large share of the store
// costs its whole length, however small the answer. Kinds are exactly that kind
// of term: there are only a handful in use. So kinds (and authors, unless a tag
// is already driving) are tested on the events rows the index finds, which
// costs a column read on a row that was going to be fetched anyway. Measured
// both ways, that is 2-3× faster than intersecting a `_k:` posting list, and it
// leaves the index smaller.
//
// Storage layout:
//
//   nostr_events     the value store, keyed by the time-encoded `seq` rowid,
//                    with `coord` carrying the replaceable/addressable
//                    coordinate under a partial unique index.
//   nostr_tags_fts   one row per event: its tag tokens, plus `_p:<pubkey>` and,
//                    for deletion requests, `_d:`/`_c:` tokens naming what they
//                    delete. Contentless and `detail=none`, which reduces FTS5
//                    to a bare inverted index — no positions, no column tags,
//                    no copy of the text.
//   nostr_events_fts NIP-50 search over `content`, tokenized for prose.
//
// Token encoding: FTS5 tokenizers split on punctuation and fold case, so a tag
// value is only safe to embed verbatim when it is lowercase alphanumeric —
// which the values that matter (event ids, pubkeys, most topics) are. Anything
// else is hex-escaped to `_<hex>`, a form no tokenizer will split or alter, and
// which can't be confused with a verbatim value since those contain no
// underscore. Tag *names* are encoded the same way, so the reserved `_p:`,
// `_d:` and `_c:` prefixes can never be produced by a user's tag: an escaped
// name is `_` followed by an even number of hex digits, and none of `p`, `d`
// or `c` alone is that.
//
// ============================================================================

/** Bits of the rowid reserved for the per-second sequence number. */
const SEQ_BITS = 20;

/** Rowids per second: how many events may share one `created_at`. */
const SEQ_SPACE = 2 ** SEQ_BITS;

/**
 * Largest `created_at` the rowid encoding can carry (2106-02-07). Beyond this
 * the timestamp is clamped, which keeps the rowid a safe integer at the cost of
 * ordering *among* absurdly-dated events; plans touching such an event fall
 * back to matching it in memory, so results stay correct either way.
 */
const MAX_TIME = 0xFFFFFFFF;

/** How many candidate rows a paged scan reads per round trip. */
const CHUNK_SIZE = 512;

/**
 * Upper bound on bound parameters per statement. SQLite's own limit is 32766
 * since 3.32, but was 999 before it, and a driver may impose its own.
 */
const MAX_PARAMS = 900;

/** Columns a staged event row binds, and a staged token row. */
const EVENT_WIDTH = 7;
const TOKEN_WIDTH = 2;

/** Upper bound on the rows one page of a scan may read, however large the limit. */
const MAX_PAGE = 10_000;

/**
 * Longest `IN (…)` list driving a scan over the events table before it is split
 * across statements.
 */
const MAX_IN = 500;

/**
 * Most terms one MATCH expression may `OR` together. FTS5 opens an iterator per
 * term, so a very long list is split across statements and merged instead.
 */
const MAX_OR = 500;

/**
 * Whether a value list is short enough to filter (rather than drive) a scan
 * over the events table.
 */
const MAX_PUSHDOWN = 100;

/**
 * An `NStore` backed by SQLite that indexes tags as full-text tokens rather
 * than b-tree rows, and keys every table by time.
 *
 * It depends on no particular SQLite library: give it an object with `run` and
 * `all` and it works with whatever driver is already at hand — `node:sqlite`,
 * `better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite in the browser, or a
 * remote database over HTTP. Either method may be sync or async.
 *
 * ```ts
 * import { DatabaseSync } from 'node:sqlite';
 * import { NSQLite } from '@nostrify/sqlite';
 *
 * const sqlite = new DatabaseSync('events.db');
 *
 * const store = new NSQLite({
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
export class NSQLite implements NStore {
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
    this.indexTags = opts.indexTags ?? NSQLite.indexTags;
    this.onQuery = opts.onQuery;

    this.events = `${prefix}_events`;
    this.tags = `${prefix}_tags_fts`;
    this.fts = `${prefix}_events_fts`;

    this.idxPubkey = `${this.events}_pubkey`;
    this.idxKind = `${this.events}_kind`;
    this.idxPubkeyKind = `${this.events}_pubkey_kind`;
    this.idxCoord = `${this.events}_coord`;
  }

  /** Default tag index policy: every single-letter tag with a usable value. */
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
    // these are already `(…, created_at)` indexes — scanned backwards for
    // newest-first with no sorter and no `created_at`/`id` in the key.
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxKind} ON ${this.events} (kind)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxPubkey} ON ${this.events} (pubkey)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxPubkeyKind} ON ${this.events} (pubkey, kind)`);

    // Partial, so the index holds one entry per replaceable event rather than
    // one per event — and unique, because a coordinate having exactly one live
    // version is the invariant the write path exists to maintain.
    await this.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.idxCoord} ON ${this.events} (coord) WHERE coord IS NOT NULL`,
    );

    // The tag index: one row per event, holding its tag tokens plus a `_p:`
    // token for its author, so a filter naming both is still one lookup.
    //
    // `tokenchars ':_'` is what makes a tag token indivisible: without it the
    // tokenizer would split `e:<id>` into `e` and `<id>`, and a `#e` filter
    // would match any event mentioning that id in any tag at all.
    //
    // `detail=none` strips everything FTS5 keeps for *text*: no positions, no
    // per-column tags, just a delta-encoded list of rowids per token. That is
    // precisely an inverted index and nothing more — the smallest form of the
    // only thing this table is asked for. `content=''` drops the copy of the
    // text FTS5 would otherwise keep, and `contentless_delete` keeps rows
    // deletable, which a plain contentless table isn't.
    await this.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tags} USING fts5(
        tokens,
        tokenize = 'ascii tokenchars '':_''',
        content = '',
        contentless_delete = 1,
        detail = none
      )
    `);

    // NIP-50 search, kept in a table of its own so the two can be tokenized on
    // their own terms: prose wants case folding, diacritic stripping and
    // positions for phrases, none of which a tag token has any use for.
    await this.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.fts}
      USING fts5(content, tokenize = 'unicode61 remove_diacritics 2', content = '', contentless_delete = 1)
    `);

    // Every commit leaves behind a segment, and a query with N terms opens an
    // iterator per term *per segment* — so a store written an event at a time,
    // as a relay writes, answers a multi-term filter several times slower than
    // the same data bulk-loaded. `automerge` is FTS5's incremental defrag: it
    // folds a little merging into each write. Turning it down from the default
    // 4 to its minimum measured free on the write side and several times faster
    // on many-term reads, which is the trade this store wants.
    await this.exec(`INSERT INTO ${this.tags}(${this.tags}, rank) VALUES('automerge', 2)`);
    await this.exec(`INSERT INTO ${this.fts}(${this.fts}, rank) VALUES('automerge', 2)`);

    // The search index is maintained entirely by triggers — its content is a
    // field of the event, so SQLite can read it out of the stored JSON without
    // a round trip, and no write path can forget to. The token index can only
    // be kept in step on delete this way, since its tokens depend on the
    // `indexTags` policy, which lives in JavaScript.
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
   * Add an event to the store: ephemeral events are dropped, replaceable and
   * addressable events supersede older versions at their coordinate, kind 5
   * requests delete what they target, and an event a stored request has already
   * deleted is rejected.
   *
   * Events handed over without an intervening `await` are committed in one
   * transaction. The contract is unchanged — the promise resolves only once
   * that event is durably committed — but the per-event overhead is amortized
   * across the burst, so feeding events in concurrently is worth several times
   * awaiting each in turn.
   */
  event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.pending.push({ event, resolve, reject });
      this.scheduleFlush();
    });
  }

  /**
   * Schedule a flush for the events queued so far.
   *
   * A microtask is the tightest window that still catches a whole burst: it
   * runs after the synchronous run of code that queued the events, and before
   * any I/O the event loop might otherwise interleave.
   */
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
    const queued = this.pending;
    if (queued.length === 0) return;

    this.pending = [];

    const rejections = new Map<PendingWrite, unknown>();

    try {
      await this.transaction(async () => {
        const staged = new WriteBatch();

        for (const item of queued) {
          // An event whose write depends on what is already stored — the
          // version at its coordinate, or the events it deletes — has to see
          // the batch so far, so the batch is written out before it and again
          // after, leaving it exactly the view it had when writes were
          // unbatched.
          const alone = NSQLite.dependsOnStore(item.event);
          if (alone) await this.writeBatch(staged);

          try {
            await this.writeEvent(item.event, staged);
          } catch (error) {
            if (error instanceof RelayError) {
              rejections.set(item, error);
              continue;
            }
            throw error;
          } finally {
            if (alone) await this.writeBatch(staged);
          }
        }

        await this.writeBatch(staged);
      });
    } catch (error) {
      for (const item of queued) item.reject(error);
      return;
    }

    for (const item of queued) {
      const rejection = rejections.get(item);
      if (rejection) item.reject(rejection);
      else item.resolve();
    }
  }

  /**
   * Whether an event's write reads back something it may itself have just
   * written, and so can't be staged alongside its neighbours.
   *
   * Replaceable and addressable events look up the version at their coordinate;
   * deletion requests look up their targets by id.
   */
  private static dependsOnStore(event: NostrEvent): boolean {
    return event.kind === 5 || NKinds.replaceable(event.kind) || NKinds.addressable(event.kind);
  }

  /**
   * Write the staged rows, as few statements as their parameters allow.
   *
   * A row per statement is the obvious shape and the wrong one. `nostr_events`
   * carries an `AFTER INSERT` trigger maintaining the search index, and SQLite
   * runs a trigger's sub-program once per INSERT *statement* rather than
   * folding it into the row loop — so a row per statement pays that setup once
   * per event. Armada, where this store's schema also runs, measured the
   * difference at 76µs a row against 17µs for the same rows and the same
   * trigger written in batches.
   *
   * The token rows go first, so no reader on another connection can find an
   * event before the tokens describing it exist.
   */
  private async writeBatch(staged: WriteBatch): Promise<void> {
    if (staged.size === 0) return;

    for (const chunk of batch(staged.tokens, MAX_PARAMS - MAX_PARAMS % TOKEN_WIDTH)) {
      await this.run(
        `INSERT INTO ${this.tags} (rowid, tokens) VALUES ${tuples(chunk.length / TOKEN_WIDTH, TOKEN_WIDTH)}`,
        chunk,
      );
    }

    for (const chunk of batch(staged.events, MAX_PARAMS - MAX_PARAMS % EVENT_WIDTH)) {
      await this.run(
        `INSERT INTO ${this.events} (seq, id, kind, pubkey, created_at, coord, json) VALUES ${
          tuples(chunk.length / EVENT_WIDTH, EVENT_WIDTH)
        }`,
        chunk,
      );
    }

    staged.clear();
  }

  /**
   * Apply a single event's writes. Runs inside the batch transaction.
   *
   * The three questions a write has to ask first — is this event already
   * stored, has a deletion request already removed it, and which rowid is free
   * at its timestamp — are all answered by one statement, since each is a
   * scalar subquery over an index and none of them depends on the others.
   */
  private async writeEvent(event: NostrEvent, staged: WriteBatch): Promise<void> {
    const check = await this.check(event, staged);

    if (check.deleted) {
      throw new RelayError('invalid', 'event deleted');
    }

    // Already stored: a re-delivered event is a no-op.
    if (check.stored) return;

    const coord = NKinds.replaceable(event.kind) || NKinds.addressable(event.kind) ? NSQLite.getCoord(event) : null;

    if (coord !== null) {
      const [existing] = await this.all(
        `SELECT id, seq, created_at FROM ${this.events} WHERE coord = ?`,
        [coord],
      );

      if (existing) {
        const stored = { id: existing.id as string, created_at: Number(existing.created_at) };
        // Per NIP-01 the stored version wins ties, so only a strictly newer
        // event replaces it.
        if (!NSQLite.isNewer(event, stored)) return;
        // Deleted before the insert, since the coordinate index is unique.
        await this.deleteEvents([Number(existing.seq)]);
      }
    }

    staged.add(event, check.seq, coord, this.tagTokens(event));

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
   * same one. It costs a single seek to the end of the timestamp's bucket, and
   * it rides along in a statement the write was making anyway.
   */
  private async check(
    event: NostrEvent,
    staged: WriteBatch,
  ): Promise<{ stored: boolean; deleted: boolean; seq: number }> {
    const base = NSQLite.bucket(event.created_at);
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
      phrase(`_d:${part(event.id)}`),
    ];

    // `e` deletions apply to an id whenever they were issued; `a` deletions
    // only to versions at or before the request, so a newer replacement of a
    // coordinate is allowed back in.
    if (replaceable) {
      terms.push(
        `(SELECT rowid FROM ${this.tags} WHERE ${this.tags} MATCH ? AND rowid >= ? LIMIT 1) AS superseded`,
      );
      params.push(phrase(`_c:${part(NSQLite.getCoord(event))}`), base);
    }

    const [row] = await this.all(`SELECT ${terms.join(', ')}`, params);

    const requests = [row?.deleted, row?.superseded]
      .filter((value) => value !== null && value !== undefined)
      .map(Number);

    // The rowid has to clear both what is stored and what is staged, or two
    // events arriving in one burst at the same timestamp would be handed the
    // same one.
    const stored = row?.last === null || row?.last === undefined ? base - 1 : Number(row.last);
    const seq = Math.max(stored, staged.lastSeq(base) ?? base - 1) + 1;

    // One second may hold 2²⁰ events. A relay that manages more of them at the
    // same timestamp has outgrown this encoding, and silently reordering its
    // events would be worse than saying so.
    if (seq >= base + SEQ_SPACE) {
      throw new RelayError('error', 'too many events at this timestamp');
    }

    return {
      stored: (row?.existing !== null && row?.existing !== undefined) || staged.has(event.id),
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
   * An event's index terms as a single space-separated token string: its
   * indexed tags, plus `_p:<pubkey>` so an author constraint can be merged
   * into the same MATCH as the tags.
   */
  private tagTokens(event: NostrEvent): string {
    // The author rides along as a token so a filter that names both a tag and
    // an author is still one index lookup. The *kind* deliberately doesn't:
    // there are only a handful of kinds in use, so `_k:1` would be a posting
    // list covering a large share of the store, and intersecting one of those
    // measured several times more expensive than testing `kind` on the rows
    // the tag already found.
    const tokens: string[] = [`_p:${part(event.pubkey)}`];
    const seen = new Set<string>();

    for (const [name, value] of this.indexTags(event)) {
      if (typeof name !== 'string' || typeof value !== 'string') continue;
      const token = tagToken(name, value);
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }

    // What a deletion request deletes, indexed under its own prefix.
    //
    // This is the one question asked on every single write — has anything
    // already deleted the event being written? — and asking it of the `e` tags
    // would mean intersecting them with `_k:5`, since an ordinary reply
    // carries `e` tags too. Giving deletion targets a token of their own makes
    // that a single term, and a term this store looks up a hundred thousand
    // times an hour is worth half the work of a two-term intersection.
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

    // The coordinate is a column of the events table, so the versions a request
    // may delete are found without a second table to consult.
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
   * column of the row rather than a table keyed by it — which is what spares
   * this path reading every row back and parsing its JSON to work out which
   * coordinates to clean up.
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

    return [...byId.values()].sort(NSQLite.compareNewest);
  }

  /** Run a single parsed filter through the planner. */
  private async queryFilter(filter: ParsedFilter, signal?: AbortSignal): Promise<NostrEvent[]> {
    if (filter.neverMatch) return [];

    const limit = filter.limit ?? Infinity;
    if (limit <= 0) return [];

    signal?.throwIfAborted();

    const plan = this.planScan(filter);

    // ids plans are lookups by primary key, not scans.
    if (plan.ids) {
      return await this.queryIds(plan.ids, filter, limit);
    }

    // A single complete cursor *is* the answer: its conditions are applied
    // before its limit, so it returns exactly the rows wanted. Run it once and
    // read the event bodies straight out of it, without the key column that
    // only a later page would need.
    if (plan.cursors.length === 1 && plan.sqlOnly) {
      const rows = await this.readPage(plan.cursors[0], undefined, limit === Infinity ? undefined : limit, false);
      return rows.filter((row) => row.event).map((row) => row.event!);
    }

    const collected: NostrEvent[] = [];
    const seen = new Set<string>();

    // A complete plan yields only matches, so a page need be no larger than
    // what's still wanted; an incomplete one pages in chunks so a filter that
    // matches little doesn't materialize the whole range.
    let pageSize = plan.sqlOnly ? Math.min(limit, MAX_PAGE) : CHUNK_SIZE;

    let before: number | undefined;

    while (collected.length < limit) {
      signal?.throwIfAborted();

      const page = await this.scanPage(plan, before, pageSize);
      if (page.length === 0) break;

      before = page[page.length - 1].seq;

      for (const { event } of page) {
        if (collected.length >= limit) break;
        if (!event) continue;
        if (seen.has(event.id)) continue;
        seen.add(event.id);

        if (plan.sqlOnly || filter.matches(event, plan.searched)) collected.push(event);
      }

      // A short page means the scan is exhausted.
      if (page.length < pageSize) break;

      // Still short of the limit after a full page, so the conditions are
      // rejecting more than they're keeping. Widening geometrically bounds the
      // number of round trips a very selective filter costs.
      pageSize = Math.min(pageSize * 4, MAX_PAGE);
    }

    collected.sort(NSQLite.compareNewest);
    return collected;
  }

  /** Fetch events by id, applying whatever else the filter asks for. */
  private async queryIds(ids: string[], filter: ParsedFilter, limit: number): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for (const chunk of batch(ids, MAX_PARAMS - 8)) {
      const conditions = [memberOf('id', chunk)];
      const params: NSQLiteValue[] = [...chunk];

      if (filter.since !== undefined) {
        conditions.push('created_at >= ?');
        params.push(filter.since);
      }
      if (filter.until !== undefined) {
        conditions.push('created_at <= ?');
        params.push(filter.until);
      }
      if (filter.kinds && filter.kinds.length <= MAX_PUSHDOWN) {
        conditions.push(memberOf('kind', filter.kinds));
        params.push(...filter.kinds);
      }
      if (filter.authors && filter.authors.length <= MAX_PUSHDOWN) {
        conditions.push(memberOf('pubkey', filter.authors));
        params.push(...filter.authors);
      }

      for (const row of await this.all(`SELECT json FROM ${this.events}${where(conditions)}`, params)) {
        const event: NostrEvent = JSON.parse(row.json as string);
        if (filter.matches(event)) events.push(event);
      }
    }

    events.sort(NSQLite.compareNewest);
    return events.length > limit ? events.slice(0, limit) : events;
  }

  /** Read one page of events, newest-first, merging the plan's cursors. */
  private async scanPage(plan: ScanPlan, before: number | undefined, pageSize: number): Promise<Candidate[]> {
    if (plan.cursors.length === 1) {
      return await this.readPage(plan.cursors[0], before, pageSize);
    }

    const merged: Candidate[] = [];

    for (const cursor of plan.cursors) {
      merged.push(...await this.readPage(cursor, before, pageSize));
    }

    merged.sort((a, b) => b.seq - a.seq);
    return merged.slice(0, pageSize);
  }

  /**
   * Read one cursor's next rows, newest-first.
   *
   * Either shape returns only rows that passed every condition the cursor can
   * express, with the limit applied after them — so a cursor whose plan is
   * complete answers the whole query in one statement, and paging exists only
   * for plans the in-memory matcher still has to finish.
   */
  private async readPage(
    cursor: ScanCursor,
    before: number | undefined,
    limit: number | undefined,
    keys = true,
  ): Promise<Candidate[]> {
    let sql: string;
    const params: NSQLiteValue[] = [];

    if (!('from' in cursor)) {
      const scan = this.ftsScan(cursor, before);

      const conditions = [...scan.conditions, ...(cursor.where ?? [])];
      params.push(...scan.params, ...(cursor.params ?? []));

      // `CROSS JOIN` is load-bearing. It is SQLite's one way to fix a join
      // order, and without it a condition on the events table is enough to make
      // the planner drive from *there* instead — seeking this index by rowid
      // once per row, re-evaluating the MATCH every time, then sorting the
      // result through a temp b-tree.
      //
      // The conditions come first and the `LIMIT` last, which is what makes
      // this one statement rather than a paging loop: SQLite walks the posting
      // lists backwards and stops as soon as `limit` rows have survived
      // *everything*, so a page never comes back short of rows that exist.
      sql = `SELECT ${
        keys ? `${scan.driver}.rowid AS seq, ` : ''
      }e.json FROM ${scan.driver} CROSS JOIN ${this.events} e ON e.seq = ${scan.driver}.rowid${
        where(conditions)
      } ORDER BY ${scan.driver}.rowid DESC${limit === undefined ? '' : ' LIMIT ?'}`;

      if (limit !== undefined) params.push(limit);
    } else {
      const conditions = [...cursor.where];
      params.push(...cursor.params);

      if (before !== undefined) {
        conditions.push('seq < ?');
        params.push(before);
      }

      // The key is only read when a later page has to resume from it; a scan
      // that answers the whole query in one go leaves the column out, which is
      // worth a tenth of the statement.
      sql = `SELECT ${keys ? 'seq, ' : ''}json FROM ${cursor.from}${where(conditions)} ORDER BY seq DESC${
        limit === undefined ? '' : ' LIMIT ?'
      }`;

      if (limit !== undefined) params.push(limit);
    }

    const rows = await this.all(sql, params);

    return rows.map((row) => ({
      seq: keys ? Number(row.seq) : 0,
      event: row.json === null || row.json === undefined ? undefined : JSON.parse(row.json as string) as NostrEvent,
    }));
  }

  /**
   * The index scan behind a full-text cursor: which table drives it, and the
   * conditions that bound it.
   *
   * Tokens drive whenever there are tokens, since the token index also carries
   * the time window and the ordering; a keyword-only filter drives the text
   * index the same way. Keywords *alongside* tokens are a second index to
   * intersect with, which FTS5 can't do across tables, so they are resolved to
   * a set the driving scan tests against.
   */
  private ftsScan(
    cursor: FtsCursor,
    before: number | undefined,
  ): { driver: string; conditions: string[]; params: NSQLiteValue[] } {
    const driver = cursor.match ? this.tags : this.fts;
    const conditions = [`${driver} MATCH ?`];
    const params: NSQLiteValue[] = [cursor.match ?? cursor.search!];

    // Every rowid reference is qualified, since the events table joined against
    // this one has an `INTEGER PRIMARY KEY` and therefore a `rowid` of its own.
    if (cursor.match && cursor.search) {
      // The `+` is load-bearing. Without it SQLite hands the rowid list to the
      // *token* index as a constraint, which turns one descending scan into one
      // scan per keyword match; with it, the list stays an ordinary filter over
      // a single scan, and SQLite builds a bloom filter for it. Measured 9×.
      conditions.push(`+${driver}.rowid IN (SELECT rowid FROM ${this.fts} WHERE ${this.fts} MATCH ?)`);
      params.push(cursor.search);
    }

    if (cursor.min !== undefined) {
      conditions.push(`${driver}.rowid >= ?`);
      params.push(cursor.min);
    }

    // The paging bound and the filter's `until` are the same kind of
    // constraint, so whichever is tighter is the one that's applied.
    const max = before !== undefined ? before - 1 : cursor.max;

    if (max !== undefined) {
      conditions.push(`${driver}.rowid <= ?`);
      params.push(max);
    }

    return { driver, conditions, params };
  }

  /**
   * The query planner.
   *
   * A filter that names a tag or a keyword is driven by the index, which finds
   * its rows newest-first and lets the events table test what's left. Anything
   * else is driven by a b-tree, chosen by strfry's `DBScan` priority cascade —
   * ids, then tags or search, then pubkey+kind, pubkey, kind, and finally the
   * whole store. Every one of those indexes is ordered by time already, so each
   * is read newest-first with no sorter.
   */
  private planScan(filter: ParsedFilter): ScanPlan {
    // 1. ids — the primary key.
    if (filter.ids) {
      return { ids: filter.ids, cursors: [], sqlOnly: false, searched: false };
    }

    const { min, max, exact } = this.timeRange(filter);

    // 2. tags, or a NIP-50 search: the index drives.
    if (filter.tags.length > 0 || filter.searchQuery) {
      const plan = this.planFts(filter, min, max, exact);
      if (plan) return plan;
    }

    /** Append the filter's time bounds to an events-table cursor. */
    const addTime = (conditions: string[], params: NSQLiteValue[]): void => {
      // The rowid bound is what stops the scan early; the `created_at` test is
      // what makes it exact, for the timestamps the encoding has to clamp.
      if (min !== undefined) {
        conditions.push('seq >= ?');
        params.push(min);
      }
      if (max !== undefined) {
        conditions.push('seq <= ?');
        params.push(max);
      }
      if (filter.since !== undefined) {
        conditions.push('created_at >= ?');
        params.push(filter.since);
      }
      if (filter.until !== undefined) {
        conditions.push('created_at <= ?');
        params.push(filter.until);
      }
    };

    const searched = !filter.searchKeywords;
    const pushKinds = !filter.kinds || filter.kinds.length <= MAX_PUSHDOWN;

    // 3. authors + kinds, from the composite index.
    //
    //    SQLite seeks this index once per (author, kind) combination, which is
    //    why a design whose index entries end in `(created_at DESC, id)` has to
    //    abandon it once the product grows past a thousand or so. Here the
    //    entries are (pubkey, kind, time) in that order — the rowid supplying
    //    the time — so each seek walks straight to the newest events of a
    //    combination and stops. A 500-author feed measured faster this way than
    //    either scanning by author or merging the same constraint in the token
    //    index.
    if (filter.authors && filter.kinds && pushKinds) {
      const cursors = [...batch(filter.authors, MAX_IN)].map((authors): ScanCursor => {
        const conditions = [memberOf('pubkey', authors), memberOf('kind', filter.kinds!)];
        const params: NSQLiteValue[] = [...authors, ...filter.kinds!];

        addTime(conditions, params);

        return { from: `${this.events} INDEXED BY ${this.idxPubkeyKind}`, where: conditions, params };
      });

      return { cursors, sqlOnly: searched, searched };
    }

    // 4. authors alone, with kinds filtering the scan when there are few
    //    enough of them to be worth binding.
    if (filter.authors) {
      const cursors = [...batch(filter.authors, MAX_IN)].map((authors): ScanCursor => {
        const conditions = [memberOf('pubkey', authors)];
        const params: NSQLiteValue[] = [...authors];

        addTime(conditions, params);

        if (filter.kinds && pushKinds) {
          conditions.push(memberOf('kind', filter.kinds));
          params.push(...filter.kinds);
        }

        return { from: `${this.events} INDEXED BY ${this.idxPubkey}`, where: conditions, params };
      });

      return { cursors, sqlOnly: searched && pushKinds, searched };
    }

    // 5. kinds.
    if (filter.kinds) {
      const cursors = [...batch(filter.kinds, MAX_IN)].map((kinds): ScanCursor => {
        const conditions = [memberOf('kind', kinds)];
        const params: NSQLiteValue[] = [...kinds];

        addTime(conditions, params);

        return { from: `${this.events} INDEXED BY ${this.idxKind}`, where: conditions, params };
      });

      return { cursors, sqlOnly: searched, searched };
    }

    // 6. fallback — the whole store. The table is clustered by time, so this
    //    is a backwards walk of the table itself, with no index in the way.
    const conditions: string[] = [];
    const params: NSQLiteValue[] = [];
    addTime(conditions, params);

    return {
      cursors: [{ from: this.events, where: conditions, params }],
      sqlOnly: searched,
      searched,
    };
  }

  /**
   * Plan a filter as one or more MATCH expressions, or `undefined` when the
   * index can't drive it.
   *
   * Every constraint becomes a group of alternatives — the tag values, the
   * kinds, the authors, the NIP-50 keywords — and the groups are ANDed. FTS5
   * evaluates that by merging the groups' doclists, so the cost is the length
   * of the *shortest* group rather than the product of them all.
   */
  private planFts(
    filter: ParsedFilter,
    min: number | undefined,
    max: number | undefined,
    exact: boolean,
  ): ScanPlan | undefined {
    const groups: string[][] = [];

    for (const tag of filter.tags) {
      groups.push(tag.values.map((value) => tagToken(tag.name, value)));
    }

    // A search whose keywords are all negations has nothing for FTS5 to match
    // against — there is no way to say "every row except these" — so it is left
    // to the in-memory matcher.
    const searched = !filter.searchKeywords || !!filter.searchQuery;

    // Authors join the tags in the index, where they are one more posting list
    // to intersect. Without a tag to intersect *with*, they are better served
    // by their own b-tree, so they're only added here when there is one.
    const inIndex = groups.length > 0 && !!filter.authors && filter.authors.length <= MAX_OR;

    if (inIndex) {
      groups.push(filter.authors!.map((pubkey) => `_p:${part(pubkey)}`));
    }

    if (groups.length === 0 && !filter.searchQuery) return undefined;

    // Whatever the index isn't carrying is tested on the rows it finds, which
    // is what the events table is for. Every condition still ends up in SQL —
    // it just costs a column read on a row already fetched instead of a posting
    // list intersection over the whole store.
    const where: string[] = [];
    const params: NSQLiteValue[] = [];

    if (filter.kinds && filter.kinds.length <= MAX_PUSHDOWN) {
      where.push(memberOf('e.kind', filter.kinds));
      params.push(...filter.kinds);
    }

    if (!inIndex && filter.authors && filter.authors.length <= MAX_PUSHDOWN) {
      where.push(memberOf('e.pubkey', filter.authors));
      params.push(...filter.authors);
    }

    // Timestamps the rowid encoding had to clamp are re-checked exactly here,
    // rather than in memory.
    if (!exact && filter.since !== undefined) {
      where.push('e.created_at >= ?');
      params.push(filter.since);
    }
    if (!exact && filter.until !== undefined) {
      where.push('e.created_at <= ?');
      params.push(filter.until);
    }

    const complete = (!filter.kinds || filter.kinds.length <= MAX_PUSHDOWN) &&
      (inIndex || !filter.authors || filter.authors.length <= MAX_PUSHDOWN);

    // The longest group is the one worth splitting: every cursor carries every
    // other group in full, so splitting a short one would repeat more work.
    const longest = groups.reduce((a, b) => (b.length > a.length ? b : a), groups[0] ?? []);
    const chunks = longest.length > MAX_OR ? [...batch(longest, MAX_OR)] : [longest];

    const cursors: ScanCursor[] = chunks.map((chunk): ScanCursor => ({
      match: groups.length > 0 ? matchExpr(groups.map((group) => (group === longest ? chunk : group))) : undefined,
      search: filter.searchQuery,
      min,
      max,
      where,
      params,
    }));

    return { cursors, sqlOnly: complete && searched, searched };
  }

  /**
   * The rowid window a filter's `since`/`until` bounds describe, and whether
   * that window is exact — it isn't when a bound falls outside the range the
   * rowid encoding can represent, in which case the events in the clamped
   * bucket have to be re-checked in memory.
   */
  private timeRange(filter: ParsedFilter): { min?: number; max?: number; exact: boolean } {
    let exact = true;
    let min: number | undefined;
    let max: number | undefined;

    if (filter.since !== undefined) {
      if (filter.since > MAX_TIME || filter.since < 0) exact = false;
      min = NSQLite.bucket(filter.since);
    }

    if (filter.until !== undefined) {
      if (filter.until > MAX_TIME || filter.until < 0) exact = false;
      max = NSQLite.bucket(filter.until) + SEQ_SPACE - 1;
    }

    return { min, max, exact };
  }

  /** COUNT support: the number of matching events. */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    // A single complete plan is counted inside the index: no rows returned, no
    // event bodies read. One event is one row of the full-text index however
    // many of its tags matched, so nothing has to be de-duplicated.
    if (filters.length === 1) {
      const filter = new ParsedFilter(filters[0]);
      if (filter.neverMatch) return { count: 0, approximate: false };

      if (filter.limit === undefined) {
        const plan = this.planScan(filter);

        if (plan.sqlOnly && !plan.ids && plan.cursors.length === 1) {
          const [cursor] = plan.cursors;
          let sql: string;
          const params: NSQLiteValue[] = [];

          if (!('from' in cursor)) {
            const scan = this.ftsScan(cursor, undefined);
            params.push(...scan.params);

            // With nothing left to test, the index knows the answer by itself —
            // one event is one row of it, however many of its tags matched, so
            // there is nothing to de-duplicate either. Otherwise the rows still
            // have to be visited, but only their columns, never their bodies.
            sql = cursor.where?.length
              ? `SELECT COUNT(*) AS count FROM ${scan.driver} CROSS JOIN ${this.events} e ON e.seq = ${scan.driver}.rowid${
                where([...scan.conditions, ...cursor.where])
              }`
              : `SELECT COUNT(*) AS count FROM ${scan.driver}${where(scan.conditions)}`;

            params.push(...(cursor.where?.length ? cursor.params ?? [] : []));
          } else {
            sql = `SELECT COUNT(*) AS count FROM ${cursor.from}${where(cursor.where)}`;
            params.push(...cursor.params);
          }

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

  [Symbol.toStringTag] = 'NSQLite';
}

/**
 * Rows staged for the current transaction's multi-row INSERTs, with enough of
 * an index over them to answer the two questions a write asks of rows that
 * aren't in the table yet: is this event among them, and which rowid at this
 * timestamp have they already taken.
 */
class WriteBatch {
  /** Flat `(seq, id, kind, pubkey, created_at, coord, json)` tuples. */
  readonly events: NSQLiteValue[] = [];
  /** Flat `(rowid, tokens)` tuples. */
  readonly tokens: NSQLiteValue[] = [];

  private readonly ids = new Set<string>();
  private readonly highest = new Map<number, number>();

  /** How many events are staged. */
  get size(): number {
    return this.ids.size;
  }

  add(event: NostrEvent, seq: number, coord: string | null, tokens: string): void {
    this.events.push(seq, event.id, event.kind, event.pubkey, event.created_at, coord, JSON.stringify(event));
    this.tokens.push(seq, tokens);
    this.ids.add(event.id);

    const base = seq - seq % SEQ_SPACE;
    const previous = this.highest.get(base);

    if (previous === undefined || seq > previous) {
      this.highest.set(base, seq);
    }
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** The highest rowid staged in a timestamp's bucket, if any. */
  lastSeq(base: number): number | undefined {
    return this.highest.get(base);
  }

  clear(): void {
    this.events.length = 0;
    this.tokens.length = 0;
    this.ids.clear();
    this.highest.clear();
  }
}

/** An event queued for the next batched commit, with its caller's settlers. */
interface PendingWrite {
  event: NostrEvent;
  resolve(): void;
  reject(error: unknown): void;
}

/**
 * A row a scan produced: its rowid, which is where paging resumes from, and
 * the event — absent when the scan found the row but its conditions rejected
 * it.
 */
interface Candidate {
  seq: number;
  event?: NostrEvent;
}

/**
 * One scan: either a full-text match over a window of rowids, or a b-tree scan
 * over the events table.
 */
type ScanCursor = FtsCursor | TableCursor;

/**
 * A full-text scan, bounded by the filter's time range: a token expression, a
 * NIP-50 keyword expression, or both, plus whatever conditions are left for the
 * events rows it finds.
 */
interface FtsCursor {
  match?: string;
  search?: string;
  min?: number;
  max?: number;
  /** Conditions on the matched events, as `e.column …`. */
  where?: string[];
  params?: NSQLiteValue[];
}

/** A scan of the events table with a forced index. */
interface TableCursor {
  from: string;
  where: string[];
  params: NSQLiteValue[];
}

/** A planned scan: how to fetch a single filter's events. */
interface ScanPlan {
  /** For ids plans: fetch these primary keys directly instead of scanning. */
  ids?: string[];
  /**
   * Normally one scan. A filter with a value list too long for a single MATCH
   * is split into several, merged by the caller.
   */
  cursors: ScanCursor[];
  /** Whether the cursors express the filter completely. */
  sqlOnly: boolean;
  /** Whether the plan applies the filter's NIP-50 keywords itself. */
  searched: boolean;
}
