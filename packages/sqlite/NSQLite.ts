import { NKinds, RelayError } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter, NostrRelayCOUNT, NStore } from '@nostrify/types';

import type { NSQLiteDatabase, NSQLiteOpts, NSQLiteRow, NSQLiteValue } from './types.ts';
import { ParsedFilter, type TagFilter } from './ParsedFilter.ts';
import { batch, memberOf, qs, where } from './sql.ts';

// ============================================================================
// NSQLite — a general-purpose `NStore` backed by SQLite.
//
// This is a port of `NIndexedDB` (itself a port of strfry's LMDB query engine)
// onto SQLite. It keeps the same architecture: SQLite is treated as a *key
// value store* plus a set of hand-maintained indexes, and the query planner
// here — not SQLite's — decides which index a filter scans.
//
// Why not model this relationally? A tags table joined against an events table
// forces SQLite's planner to pick a join order and an index for every query,
// and it frequently picks badly for Nostr's shape (a handful of very selective
// terms, an unbounded `created_at DESC` ordering, and a small limit). By
// scanning one index for keys and then fetching values by primary key, the
// plan is fixed, predictable, and free to use whatever index is most selective
// — the "index freedom" that makes strfry fast. There are no joins anywhere in
// this file.
//
// Storage layout:
//
//   nostr_events   the value store, keyed by event id. `kind`, `pubkey` and
//                  `created_at` are duplicated out of the JSON as columns so
//                  they can be indexed and filtered without deserializing.
//   nostr_tags     the tag index: (name, value, created_at DESC, id) covering
//                  `kind`. Rows are the index — it's a WITHOUT ROWID table, so
//                  a tag scan reads exactly one b-tree.
//   nostr_coords   replaceable/addressable coordinates (`kind:pubkey:d`) → the
//                  id currently stored at that coordinate. Supersession is a
//                  single primary-key lookup rather than a scan.
//
// Every index ends in `(created_at DESC, id ASC)`, so a forward scan of any
// index prefix yields that prefix newest-first with no sorter. This mirrors
// strfry packing `created_at` into the trailing bytes of an LMDB key.
//
// Query planning (the `DBScan` priority cascade):
//   ids → most-selective #tag → pubkey+kind (<1000 combos) → pubkey → kind →
//   full created_at scan. One index is chosen and forced with `INDEXED BY`, so
//   the plan never depends on SQLite's cost estimates or on how stale ANALYZE
//   happens to be.
//
// Unlike NIndexedDB, a filter becomes a *single* statement rather than one
// cursor per discrete value, with the values as an `IN (…)` list. Stepping an
// IndexedDB cursor is a round trip, so merging N cursors in the application
// beats letting the store scan; in SQLite the whole scan runs in C, and a
// `LIMIT`-bounded sorter over one covering index measured 15× faster than
// merging the equivalent 940 per-value statements — the cost of crossing into
// the driver 940 times dwarfs what the merge saves.
//
// Scan execution is two-phase, like a key/value store:
//   1. Scan the chosen index for candidate keys. The index covers
//      `(…, created_at DESC, id ASC)`, so this reads no event bodies.
//   2. Fetch the values for those keys with a single `id IN (…)` lookup.
//
//   Conditions the chosen index can't express become part of the scan's
//   `WHERE` clause wherever SQLite can evaluate them (`kind IN …` on a tag
//   scan, for instance, works because `kind` is denormalized onto the tag
//   index). Anything left over — extra tag terms, NIP-50 keywords — is matched
//   in memory, and the scan is then paged by keyset until the filter's limit
//   is met, so memory stays bounded.
//
// A scan over `nostr_events` that SQL fully satisfies skips phase 2 and reads
// the event bodies directly, since the extra key lookup would buy nothing.
//
// NIP-50 `search` (basic full-text): the search input is parsed per NIP-50 —
// extension tokens (`key:value`) are parsed out and removed, since no
// extensions are supported and the NIP says unsupported extensions are
// ignored — and every remaining keyword must appear in the event's `content`,
// case-insensitively. A `-keyword` token means the content must NOT contain
// the keyword. Matching is done in memory (with Unicode-aware case folding,
// which SQLite's ASCII-only `LIKE` can't provide), so search always
// post-filters a scan.
//
// Replaceable/addressable supersession: on write, an older version at the same
// (kind, pubkey, d) coordinate is deleted, so queries never surface a stale
// profile or list. NIP-09 deletion requests (kind 5) are applied on write: the
// events they target (`e` by id, `a` by coordinate) are removed, but only when
// authored by the requester. A deleted event can't be re-added — the stored
// kind 5 is itself indexed by its `e`/`a` tags, so the check is one index seek.
//
// NIP-40 expiration is NOT handled, and nothing is pruned automatically.
// ============================================================================


/**
 * How many candidate keys a paged scan fetches per round trip. Only scans that
 * need in-memory post-filtering (extra tag terms, NIP-50 keywords) page; a
 * scan that SQL fully satisfies reads exactly the rows it needs.
 */
const CHUNK_SIZE = 512;

/**
 * Upper bound on bound parameters per statement. SQLite's own limit is 32766
 * on modern builds but only 999 on older ones, and some drivers impose their
 * own, so statements are split well below the floor.
 */
const MAX_PARAMS = 900;

/** Upper bound on the rows one page of a scan may read, however large the limit. */
const MAX_PAGE = 10_000;

/** Longest `IN (…)` list driving a scan before it is split across statements. */
const MAX_IN = 500;

/**
 * Longest `IN (…)` list used to *filter* a scan. A longer one is matched in
 * memory instead, which keeps the statement's parameter count bounded.
 */
const MAX_PUSHDOWN = 100;

/**
 * Most ids a secondary tag term is materialized into before it's left to the
 * in-memory match instead.
 */
const MAX_TAG_SET = 100_000;

/**
 * A general-purpose `NStore` backed by SQLite, suitable for relays, desktop
 * apps, and anywhere else a durable local event store is wanted.
 *
 * Pass any SQLite driver satisfying {@link NSQLiteDatabase}:
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
 * await store.event(event);
 * const events = await store.query([{ kinds: [1] }]);
 * ```
 */
export class NSQLite implements NStore {
  private readonly db: NSQLiteDatabase;
  private readonly indexTags: (event: NostrEvent) => string[][];
  private readonly onQuery?: (sql: string, params: NSQLiteValue[]) => void;

  /** Table names, resolved from the `tablePrefix` option. */
  private readonly events: string;
  private readonly tags: string;
  private readonly coords: string;

  /** Index names, resolved from the `tablePrefix` option. */
  private readonly idxCreatedAt: string;
  private readonly idxPubkey: string;
  private readonly idxKind: string;
  private readonly idxPubkeyKind: string;

  /** Whether a transaction opened by this store is currently in progress. */
  private inTransaction = false;

  constructor(db: NSQLiteDatabase, opts: NSQLiteOpts = {}) {
    const prefix = opts.tablePrefix ?? 'nostr';

    this.db = db;
    this.indexTags = opts.indexTags ?? NSQLite.indexTags;
    this.onQuery = opts.onQuery;

    this.events = `${prefix}_events`;
    this.tags = `${prefix}_tags`;
    this.coords = `${prefix}_coords`;

    this.idxCreatedAt = `${this.events}_created_at`;
    this.idxPubkey = `${this.events}_pubkey`;
    this.idxKind = `${this.events}_kind`;
    this.idxPubkeyKind = `${this.events}_pubkey_kind`;
  }

  /**
   * Default tag index policy: index every single-letter tag with a non-empty
   * value under 200 chars. Matches Nostrify's `NPostgres.indexTags`.
   */
  static indexTags(event: NostrEvent): string[][] {
    return event.tags.filter(([name, value]) => name.length === 1 && !!value && value.length < 200);
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  /**
   * Create the tables and indexes this store needs, if they don't already
   * exist. Safe to call on every startup.
   */
  async migrate(): Promise<void> {
    // The value store. `kind`, `pubkey` and `created_at` are duplicated out of
    // the JSON so they can be indexed and filtered without deserializing.
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.events} (
        id TEXT PRIMARY KEY,
        kind INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        json TEXT NOT NULL
      )
    `);

    // Each index ends in (created_at DESC, id ASC) so scanning a prefix yields
    // it newest-first with no sorter, and so `created_at, id` keyset paging is
    // a pure index read.
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxCreatedAt} ON ${this.events} (created_at DESC, id ASC)`);
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.idxPubkey} ON ${this.events} (pubkey, created_at DESC, id ASC)`,
    );
    await this.exec(`CREATE INDEX IF NOT EXISTS ${this.idxKind} ON ${this.events} (kind, created_at DESC, id ASC)`);
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.idxPubkeyKind} ON ${this.events} (pubkey, kind, created_at DESC, id ASC)`,
    );

    // The tag index. WITHOUT ROWID, so the table *is* the b-tree and a tag scan
    // touches exactly one. `kind` rides along as a payload column so
    // `{"#e": [...], "kinds": [...]}` — replies and reactions to a note, the
    // single most common tag query — is answered from this b-tree alone.
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tags} (
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        id TEXT NOT NULL,
        kind INTEGER NOT NULL,
        PRIMARY KEY (name, value, created_at DESC, id ASC)
      ) WITHOUT ROWID
    `);

    // Replaceable/addressable coordinates. Only the current version of a
    // coordinate is ever stored, so this maps `kind:pubkey:d` to a single id
    // and supersession costs one primary-key lookup.
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ${this.coords} (
        coord TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) WITHOUT ROWID
    `);
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Add an event to the store.
   *
   * Ephemeral events are ignored. Replaceable and addressable events supersede
   * (and delete) any older version at the same coordinate, and are themselves
   * ignored if a newer version is already stored. Kind 5 deletion requests
   * delete the events they target. An event that a stored deletion request has
   * already deleted is rejected with a `RelayError`.
   */
  async event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (NKinds.ephemeral(event.kind)) return;

    await this.transaction(async () => {
      if (await this.isDeleted(event)) {
        throw new RelayError('invalid', 'event deleted');
      }

      if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
        const coord = NSQLite.getCoord(event);

        const [existing] = await this.all(
          `SELECT id, created_at FROM ${this.coords} WHERE coord = ?`,
          [coord],
        );

        if (existing) {
          const stored = { id: existing.id as string, created_at: Number(existing.created_at) };
          // Per NIP-01 the stored version wins ties, and an identical id is a
          // no-op, so only a strictly newer event replaces it.
          if (!NSQLite.isNewer(event, stored)) return;
          await this.deleteEvents([stored.id]);
        }

        await this.insertEvent(event);

        await this.run(
          `INSERT OR REPLACE INTO ${this.coords} (coord, id, created_at) VALUES (?, ?, ?)`,
          [coord, event.id, event.created_at],
        );
      } else {
        await this.insertEvent(event);
      }

      // Applied after the insert so a kind 5 arriving alongside its targets in
      // the same session still resolves. The request itself is retained —
      // clients may need to re-broadcast it.
      if (event.kind === 5) {
        await this.applyDeletion(event);
      }
    });
  }

  /** Write the event row and its tag index rows. */
  private async insertEvent(event: NostrEvent): Promise<void> {
    // `OR IGNORE` makes a re-delivered event a no-op rather than an error.
    await this.run(
      `INSERT OR IGNORE INTO ${this.events} (id, kind, pubkey, created_at, json) VALUES (?, ?, ?, ?, ?)`,
      [event.id, event.kind, event.pubkey, event.created_at, JSON.stringify(event)],
    );

    const rows = this.tagRows(event);
    if (rows.length === 0) return;

    // 5 columns per row; batch as many as the parameter budget allows.
    const perStatement = Math.floor(MAX_PARAMS / 5);

    for (let i = 0; i < rows.length; i += perStatement) {
      const batch = rows.slice(i, i + perStatement);
      const values = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
      await this.run(
        `INSERT OR IGNORE INTO ${this.tags} (name, value, created_at, id, kind) VALUES ${values}`,
        batch.flat(),
      );
    }
  }

  /**
   * The tag index rows for an event: one per distinct `(name, value)` pair the
   * `indexTags` policy selects.
   */
  private tagRows(event: NostrEvent): NSQLiteValue[][] {
    const rows: NSQLiteValue[][] = [];
    const seen = new Set<string>();

    for (const [name, value] of this.indexTags(event)) {
      if (typeof name !== 'string' || typeof value !== 'string') continue;
      // The NUL separator can't appear in either part, so distinct pairs never
      // collide in the dedupe set.
      const key = `${name}\u0000${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([name, value, event.created_at, event.id, event.kind]);
    }

    return rows;
  }

  /**
   * Whether a stored kind 5 has already deleted this event, in which case it
   * must not be re-admitted.
   *
   * Deletion requests are indexed by their `e` and `a` tags like any other
   * event, so this is an index seek against the tag b-tree — no separate
   * bookkeeping table.
   */
  private async isDeleted(event: NostrEvent): Promise<boolean> {
    // `e` deletions apply to a specific id regardless of when they were issued;
    // `a` deletions only apply to versions at or before the request, so a newer
    // replacement is allowed back in. Each term is written as its own indexed
    // select so both are plain seeks into the tag index.
    const terms = [`SELECT id FROM ${this.tags} WHERE name = 'e' AND value = ? AND kind = 5`];
    const params: NSQLiteValue[] = [event.id];

    if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
      terms.push(
        `SELECT id FROM ${this.tags} WHERE name = 'a' AND value = ? AND created_at >= ? AND kind = 5`,
      );
      params.push(NSQLite.getCoord(event), event.created_at);
    }

    const requests = await this.all(terms.join(' UNION ALL '), params);

    if (requests.length === 0) return false;

    // Only the event's own author can delete it, so the requests have to be
    // resolved to their pubkeys.
    const authors = await this.all(
      `SELECT pubkey FROM ${this.events} WHERE id IN (${qs(requests.length)})`,
      requests.map((row) => row.id as string),
    );

    return authors.some((row) => row.pubkey === event.pubkey);
  }

  /**
   * NIP-09: delete the events a kind 5 request targets.
   *
   * A request can only delete its author's own events, so every target is
   * checked against the request's `pubkey`. `a` tags additionally only delete
   * versions at or before the request's `created_at`, so a newer replacement
   * survives.
   */
  private async applyDeletion(request: NostrEvent): Promise<void> {
    const ids = new Set<string>();

    const targets = request.tags.filter(([name, value]) => (name === 'e' || name === 'a') && !!value);
    if (targets.length === 0) return;

    const eTags = targets.filter(([name]) => name === 'e').map(([, value]) => value);
    const aTags = targets.filter(([name]) => name === 'a').map(([, value]) => value);

    for (const chunk of batch(eTags, MAX_PARAMS - 1)) {
      const rows = await this.all(
        `SELECT id FROM ${this.events} WHERE id IN (${qs(chunk.length)}) AND pubkey = ?`,
        [...chunk, request.pubkey],
      );
      for (const row of rows) ids.add(row.id as string);
    }

    // Only one version of a coordinate is ever stored, so an `a` tag resolves
    // to at most one event via a primary-key lookup.
    const owned = aTags.filter((coord) => coord.split(':')[1] === request.pubkey);

    for (const chunk of batch(owned, MAX_PARAMS - 1)) {
      const rows = await this.all(
        `SELECT id FROM ${this.coords} WHERE coord IN (${qs(chunk.length)}) AND created_at <= ?`,
        [...chunk, request.created_at],
      );
      for (const row of rows) ids.add(row.id as string);
    }

    // The request can't delete itself.
    ids.delete(request.id);

    await this.deleteEvents([...ids]);
  }

  /**
   * Delete events by id, along with their tag index rows and any coordinate
   * they occupy.
   *
   * Tag rows are removed by exact primary key, recomputed from the stored
   * event, so the tag index needs no secondary index on `id` — which would
   * otherwise cost a b-tree insert per tag on every write.
   */
  private async deleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const events: NostrEvent[] = [];
    for (const chunk of batch(ids, MAX_PARAMS)) {
      const rows = await this.all(
        `SELECT json FROM ${this.events} WHERE id IN (${qs(chunk.length)})`,
        chunk,
      );
      for (const row of rows) events.push(JSON.parse(row.json as string));
    }
    if (events.length === 0) return;

    // Deleted one row at a time, by full primary key, so each is a seek into
    // the tag b-tree. A tuple `IN (VALUES …)` would be one statement but would
    // scan the table.
    for (const event of events) {
      for (const [name, value, created_at] of this.tagRows(event)) {
        await this.run(
          `DELETE FROM ${this.tags} WHERE name = ? AND value = ? AND created_at = ? AND id = ?`,
          [name, value, created_at, event.id],
        );
      }
    }

    const coords = events
      .filter((event) => NKinds.replaceable(event.kind) || NKinds.addressable(event.kind))
      .map((event) => NSQLite.getCoord(event));

    for (const chunk of batch(coords, MAX_PARAMS)) {
      await this.run(`DELETE FROM ${this.coords} WHERE coord IN (${qs(chunk.length)})`, chunk);
    }

    for (const chunk of batch(events.map((event) => event.id), MAX_PARAMS)) {
      await this.run(`DELETE FROM ${this.events} WHERE id IN (${qs(chunk.length)})`, chunk);
    }
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  /**
   * Query events matching the filters (OR'd together), newest-first,
   * de-duplicated by id, each filter's `limit` respected.
   */
  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const byId = new Map<string, NostrEvent>();

    // Run sequentially: many SQLite drivers are synchronous or hold a single
    // connection, so concurrency would buy nothing and could interleave badly.
    for (const filter of filters) {
      for (const event of await this.queryFilter(new ParsedFilter(filter), opts?.signal)) {
        byId.set(event.id, event);
      }
    }

    return [...byId.values()].sort(NSQLite.compareNewest);
  }

  /**
   * Run a single parsed filter through the planner cascade, returning matching
   * events newest-first up to the filter's limit.
   */
  private async queryFilter(filter: ParsedFilter, signal?: AbortSignal): Promise<NostrEvent[]> {
    if (filter.neverMatch) return [];

    const limit = filter.limit ?? Infinity;
    if (limit <= 0) return [];

    signal?.throwIfAborted();

    const plan = this.planScan(filter);

    // ids plans are primary-key lookups: fetch the values directly and match
    // whatever else the filter asks for in memory.
    if (plan.ids) {
      const events: NostrEvent[] = [];

      for (const chunk of batch(plan.ids, MAX_PARAMS)) {
        const rows = await this.all(
          `SELECT json FROM ${this.events} WHERE id IN (${qs(chunk.length)})`,
          chunk,
        );
        for (const row of rows) {
          const event: NostrEvent = JSON.parse(row.json as string);
          if (filter.matches(event)) events.push(event);
        }
      }

      events.sort(NSQLite.compareNewest);
      return events.length > limit ? events.slice(0, limit) : events;
    }

    // A single cursor that SQL fully satisfies needs no candidate phase: the
    // rows the index scan yields are exactly the answer, so read their bodies
    // straight from the covering scan instead of paying a second key lookup.
    if (plan.sqlOnly && plan.cursors.length === 1 && plan.cursors[0].source === 'events') {
      const [cursor] = plan.cursors;
      const params = [...cursor.params];
      let sql = `SELECT json FROM ${cursor.from}${where(cursor.where)} ORDER BY created_at DESC, id ASC`;

      if (limit !== Infinity) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const rows = await this.all(sql, params);
      return rows.map((row) => JSON.parse(row.json as string));
    }

    // Everything else: scan the index for candidate keys, fetch their values,
    // and (when SQL couldn't express the whole filter) match in memory, paging
    // by keyset until the limit is met or the scan is exhausted.
    const collected: NostrEvent[] = [];
    const seen = new Set<string>();
    // When SQL expresses the whole filter, a page is the answer, so read the
    // limit in one go; otherwise page in chunks so post-filtering a scan that
    // matches little doesn't materialize the whole range.
    const pageSize = plan.sqlOnly && limit !== Infinity ? Math.min(limit, MAX_PAGE) : CHUNK_SIZE;

    // A single scan over `nostr_events` can read the bodies as it goes: the
    // candidates are exactly the rows wanted, so a second lookup by id would
    // re-seek rows the scan already visited. Splitting the phases still pays
    // off for tag scans (the bodies live in another table) and for split
    // scans (where each part over-reads by up to a page).
    const inline = plan.cursors.length === 1 && plan.cursors[0].source === 'events';

    // Tag terms the scan doesn't drive on, resolved to id sets so candidates
    // failing them are dropped before their bodies are ever read.
    const tagSets = await this.tagIdSets(plan, filter);

    // Each set is a necessary condition, so a candidate must appear in all of
    // them. Collapsing them up front turns the per-candidate check into one
    // lookup, and an empty intersection settles the whole filter.
    let required: Set<string> | undefined;

    if (tagSets.length > 0) {
      required = tagSets[0];
      for (const set of tagSets.slice(1)) {
        required = new Set([...required].filter((id) => set.has(id)));
      }
      if (required.size === 0) return [];
    }

    let after: Keyset | undefined;

    while (collected.length < limit) {
      signal?.throwIfAborted();

      const page = await this.scanCandidates(plan, after, pageSize, inline);
      if (page.length === 0) break;

      after = page[page.length - 1];

      const candidates = required ? page.filter(({ id }) => required.has(id)) : page;

      const values = inline || candidates.length === 0
        ? undefined
        : await this.fetchEvents(candidates.map(({ id }) => id));

      for (const candidate of candidates) {
        if (collected.length >= limit) break;
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);

        const event = candidate.event ?? values?.get(candidate.id);
        // A tag row can outlive its event if the `indexTags` policy changed
        // between the write and the delete; treat the key as a miss.
        if (!event) continue;

        if (plan.sqlOnly || filter.matches(event)) collected.push(event);
      }

      // A short page means the scan is exhausted.
      if (page.length < pageSize) break;
    }

    // Already newest-first, but merged pages can interleave `created_at` ties.
    collected.sort(NSQLite.compareNewest);
    return collected;
  }

  /**
   * Read one page of candidate keys, newest-first.
   *
   * Each cursor contributes a `LIMIT`-ed subquery over its own index range;
   * `UNION ALL` plus an outer `ORDER BY … LIMIT` makes SQLite merge them, so
   * the page costs ~`pageSize` rows per cursor rather than every row in range.
   * The subqueries are covering, so no event bodies are read here.
   *
   * With more cursors than fit in one compound statement, the work is split
   * across statements and merged here instead — each cursor still contributes
   * its own newest `pageSize` keys, so the merged page is the same.
   */
  private async scanCandidates(
    plan: ScanPlan,
    after: Keyset | undefined,
    pageSize: number,
    inline: boolean,
  ): Promise<Keyset[]> {
    const merged: Keyset[] = [];

    for (const cursor of plan.cursors) {
      const conditions = [...cursor.where];
      const params = [...cursor.params];

      if (after) {
        // Resume strictly after the last key of the previous page. The
        // `created_at <= ?` term drives the index seek; the disjunction only
        // breaks ties, and guarantees progress when a whole page shares one
        // timestamp.
        conditions.push('created_at <= ?', '(created_at < ? OR id > ?)');
        params.push(after.created_at, after.created_at, after.id);
      }

      params.push(pageSize);

      const rows = await this.all(
        `SELECT ${cursor.distinct ? 'DISTINCT ' : ''}created_at, id${inline ? ', json' : ''} FROM ${cursor.from}${
          where(conditions)
        } ORDER BY created_at DESC, id ASC LIMIT ?`,
        params,
      );

      for (const row of rows) {
        merged.push({
          created_at: Number(row.created_at),
          id: row.id as string,
          event: inline ? JSON.parse(row.json as string) : undefined,
        });
      }
    }

    if (plan.cursors.length === 1) return merged;

    merged.sort(NSQLite.compareKeyset);
    return merged.slice(0, pageSize);
  }

  /**
   * Resolve the plan's non-driving tag terms to sets of matching event ids.
   *
   * A filter like `{"#t": [...], "#p": [...]}` can only be driven by one tag
   * index. Reading each remaining term's ids — a covering scan of the tag
   * index, no event bodies — turns the rest of the intersection into a Set
   * lookup, so candidates that fail are discarded before anything is
   * deserialized. Without this, a two-tag filter parses every event matching
   * the first term just to check the second.
   *
   * A term matching more than {@link MAX_TAG_SET} events isn't worth
   * materializing; it's left to the in-memory match instead.
   */
  private async tagIdSets(plan: ScanPlan, filter: ParsedFilter): Promise<Set<string>[]> {
    if (!plan.extraTags?.length) return [];

    const sets: Set<string>[] = [];

    for (const tag of plan.extraTags) {
      const ids = new Set<string>();
      let overflowed = false;

      for (const values of batch(tag.values, MAX_IN)) {
        const conditions = ['name = ?', memberOf('value', values)];
        const params: NSQLiteValue[] = [tag.name, ...values];

        // The time bounds apply to every term, so they narrow this set too.
        if (filter.since !== undefined) {
          conditions.push('created_at >= ?');
          params.push(filter.since);
        }
        if (filter.until !== undefined) {
          conditions.push('created_at <= ?');
          params.push(filter.until);
        }

        params.push(MAX_TAG_SET + 1);

        const rows = await this.all(
          `SELECT id FROM ${this.tags}${where(conditions)} LIMIT ?`,
          params,
        );

        for (const row of rows) ids.add(row.id as string);

        if (ids.size > MAX_TAG_SET) {
          overflowed = true;
          break;
        }
      }

      if (!overflowed) sets.push(ids);
    }

    return sets;
  }

  /** Fetch event bodies by id. */
  private async fetchEvents(ids: string[]): Promise<Map<string, NostrEvent>> {
    const events = new Map<string, NostrEvent>();

    for (const chunk of batch([...new Set(ids)], MAX_PARAMS)) {
      const rows = await this.all(
        `SELECT json FROM ${this.events} WHERE id IN (${qs(chunk.length)})`,
        chunk,
      );
      for (const row of rows) {
        const event: NostrEvent = JSON.parse(row.json as string);
        events.set(event.id, event);
      }
    }

    return events;
  }

  /**
   * The query planner — a port of strfry's `DBScan` constructor. Picks exactly
   * one index by a fixed priority cascade and builds one cursor per discrete
   * value, pushing whatever else the filter asks for into each cursor's
   * `WHERE` clause when the chosen index can carry it.
   */
  private planScan(filter: ParsedFilter): ScanPlan {
    /** Append the filter's `since`/`until` bounds to a cursor. */
    const addTime = (conditions: string[], params: NSQLiteValue[]): void => {
      if (filter.since !== undefined) {
        conditions.push('created_at >= ?');
        params.push(filter.since);
      }
      if (filter.until !== undefined) {
        conditions.push('created_at <= ?');
        params.push(filter.until);
      }
    };

    /** Whether a value list is short enough to filter a scan with. */
    const pushable = (values: unknown[] | undefined): boolean => !!values && values.length <= MAX_PUSHDOWN;

    // 1. ids — the primary key. Fetched directly, no index scan.
    if (filter.ids) {
      return { ids: filter.ids, cursors: [], sqlOnly: false };
    }

    // 2. tags — the most selective tag filter (fewest values). An event
    //    carrying several of the sought values matches once per value, hence
    //    the DISTINCT.
    if (filter.tags.length > 0) {
      const tag = filter.tags.reduce((a, b) => (b.values.length < a.values.length ? b : a));
      // `kind` is denormalized onto the tag index, so kinds can filter the
      // scan; authors fall to the in-memory match. The remaining tag terms are
      // intersected against the scan by id — see `tagIds`.
      const pushKinds = pushable(filter.kinds);
      const extraTags = filter.tags.filter((other) => other !== tag);

      const cursors = [...batch(tag.values, MAX_IN)].map((values): ScanCursor => {
        const conditions = ['name = ?', memberOf('value', values)];
        const params: NSQLiteValue[] = [tag.name, ...values];

        addTime(conditions, params);

        if (pushKinds) {
          conditions.push(memberOf('kind', filter.kinds!));
          params.push(...filter.kinds!);
        }

        return { source: 'tags', from: this.tags, where: conditions, params, distinct: values.length > 1 };
      });

      return {
        cursors,
        extraTags,
        sqlOnly: !filter.searchKeywords && !filter.authors && filter.tags.length === 1 &&
          (!filter.kinds || pushKinds),
      };
    }

    // 3. authors + kinds. SQLite seeks the index once per combination, so this
    //    is only worth it while the combinatorial product stays small; beyond
    //    that, scanning by author alone and filtering on kind is cheaper.
    if (filter.authors && filter.kinds && pushable(filter.kinds) && filter.authors.length * filter.kinds.length < 1000) {
      const cursors = [...batch(filter.authors, MAX_IN)].map((authors): ScanCursor => {
        const conditions = [memberOf('pubkey', authors), memberOf('kind', filter.kinds!)];
        const params: NSQLiteValue[] = [...authors, ...filter.kinds!];

        addTime(conditions, params);

        return {
          source: 'events',
          from: `${this.events} INDEXED BY ${this.idxPubkeyKind}`,
          where: conditions,
          params,
        };
      });

      return { cursors, sqlOnly: !filter.searchKeywords };
    }

    // 4. authors. When kinds is also present it filters the scan instead of
    //    driving it.
    if (filter.authors) {
      const pushKinds = pushable(filter.kinds);

      const cursors = [...batch(filter.authors, MAX_IN)].map((authors): ScanCursor => {
        const conditions = [memberOf('pubkey', authors)];
        const params: NSQLiteValue[] = [...authors];

        addTime(conditions, params);

        if (pushKinds) {
          conditions.push(memberOf('kind', filter.kinds!));
          params.push(...filter.kinds!);
        }

        return {
          source: 'events',
          from: `${this.events} INDEXED BY ${this.idxPubkey}`,
          where: conditions,
          params,
        };
      });

      return { cursors, sqlOnly: !filter.searchKeywords && (!filter.kinds || pushKinds) };
    }

    // 5. kinds.
    if (filter.kinds) {
      const cursors = [...batch(filter.kinds, MAX_IN)].map((kinds): ScanCursor => {
        const conditions = [memberOf('kind', kinds)];
        const params: NSQLiteValue[] = [...kinds];

        addTime(conditions, params);

        return {
          source: 'events',
          from: `${this.events} INDEXED BY ${this.idxKind}`,
          where: conditions,
          params,
        };
      });

      return { cursors, sqlOnly: !filter.searchKeywords };
    }

    // 6. fallback — the whole store, newest-first.
    const conditions: string[] = [];
    const params: NSQLiteValue[] = [];
    addTime(conditions, params);

    return {
      cursors: [{
        source: 'events',
        from: `${this.events} INDEXED BY ${this.idxCreatedAt}`,
        where: conditions,
        params,
      }],
      sqlOnly: !filter.searchKeywords,
    };
  }

  /** COUNT support: the number of matching events. */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    // Fast path: a single unlimited filter that one scan expresses completely
    // is counted inside the index, with no rows returned and no event bodies
    // read. (ids plans are excluded — they're primary-key lookups, not scans.
    // So are split scans, whose parts could both see the same event.)
    if (filters.length === 1) {
      const filter = new ParsedFilter(filters[0]);
      if (filter.neverMatch) return { count: 0, approximate: false };

      if (filter.limit === undefined) {
        const plan = this.planScan(filter);

        if (plan.sqlOnly && !plan.ids && plan.cursors.length === 1) {
          const [cursor] = plan.cursors;

          const [row] = await this.all(
            `SELECT COUNT(*) AS count FROM (SELECT ${
              cursor.distinct ? 'DISTINCT ' : ''
            }created_at, id FROM ${cursor.from}${where(cursor.where)})`,
            cursor.params,
          );

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

  /** Run a statement that returns no rows. */
  private async run(sql: string, params: NSQLiteValue[] = []): Promise<void> {
    this.onQuery?.(sql, params);
    await this.db.run(sql, params);
  }

  /** Run a statement and return its rows. */
  private async all(sql: string, params: NSQLiteValue[] = []): Promise<NSQLiteRow[]> {
    this.onQuery?.(sql, params);
    return await this.db.all(sql, params);
  }

  /** Run a DDL statement, normalizing the whitespace of the template literal. */
  private async exec(sql: string): Promise<void> {
    await this.run(sql.trim().replace(/\s+/g, ' '));
  }

  /**
   * Run `fn` inside a transaction. Nested calls join the outer transaction —
   * SQLite has no nested transactions, and every writer here is small enough
   * that a savepoint would only add round trips.
   */
  private async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) return await fn();

    this.inTransaction = true;
    await this.run('BEGIN IMMEDIATE');

    try {
      const result = await fn();
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** The `kind:pubkey:d` coordinate of a replaceable or addressable event. */
  private static getCoord(event: NostrEvent): string {
    const d = NKinds.addressable(event.kind) ? event.tags.find(([name]) => name === 'd')?.[1] ?? '' : '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }

  /**
   * Per NIP-01, `a` is "newer" than `b` (same coordinate) when its created_at
   * is greater, or — on a tie — its id is lexicographically smaller.
   */
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

  /** The same ordering, over bare candidate keys. */
  private static compareKeyset(a: Keyset, b: Keyset): number {
    if (a.created_at !== b.created_at) return b.created_at - a.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  [Symbol.toStringTag] = 'NSQLite';
}

/** A candidate key produced by an index scan, and the keyset paging position. */
interface Keyset {
  created_at: number;
  id: string;
  /** The event body, when the scan read it inline rather than by a later lookup. */
  event?: NostrEvent;
}

/** One scan: a table (with a forced index) plus its conditions. */
interface ScanCursor {
  /** Which b-tree the scan reads, which decides what can be filtered on it. */
  source: 'events' | 'tags';
  /** The `FROM` clause, including any `INDEXED BY`. */
  from: string;
  where: string[];
  params: NSQLiteValue[];
  /** Whether the scan can yield the same event more than once. */
  distinct?: boolean;
}

/** A planned scan: how to fetch a single filter's candidate events. */
interface ScanPlan {
  /** For ids plans: fetch these primary keys directly instead of scanning. */
  ids?: string[];
  /**
   * Normally one scan. A filter whose driving value list is too long for a
   * single statement is split into several, merged by the caller.
   */
  cursors: ScanCursor[];
  /**
   * Tag terms the scan doesn't drive on. Each is resolved to a set of ids and
   * intersected with the candidates, so a candidate failing one never has its
   * body read.
   */
  extraTags?: TagFilter[];
  /**
   * Whether the scans' `WHERE` clauses express the filter completely, so
   * candidates need no in-memory re-check and the scan needs no paging.
   */
  sqlOnly: boolean;
}
