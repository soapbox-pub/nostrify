import BetterSQLite3 from 'better-sqlite3';
import type { NostrEvent } from '@nostrify/types';

import { NSQLite } from './NSQLite.ts';
import { NSQLiteAuto } from './NSQLiteAuto.ts';
import { NSQLiteFTS } from './NSQLiteFTS.ts';
import { NSQLiteJoin } from './NSQLiteJoin.ts';
import type { NSQLiteDatabase, NSQLiteRow, NSQLiteValue } from './types.ts';

// ============================================================================
// The SQLite stores on a synthetic dataset of a chosen size and shape.
//
// The fixture used by NSQLite.bench.ts is only 1000 events, which understates
// the differences: the relational design's cost grows with how many rows a tag
// matches, while the key/value and full-text designs' stay flat. Run this to
// see where each one stands at a realistic size.
//
//   deno run -A --no-check scale.bench.ts [count] [flags…] [store names…]
//
//     --disk         back each store with a file instead of :memory:, so page
//                    cache misses and WAL fsyncs count
//     --skew         draw authors and topics from a Zipf distribution rather
//                    than uniformly, which is what decides whether an index is
//                    worth driving
//     --replaceable  mix in replaceable and addressable kinds, so writes
//                    exercise supersession rather than only appending
//     --real         all three of the above
//
// Numbers below `ratio` are each store ÷ the first one, so above 1.0 means the
// first store is faster by that factor.
// ============================================================================

type Store = NSQLite | NSQLiteAuto | NSQLiteFTS | NSQLiteJoin;

interface StoreClass {
  new (db: NSQLiteDatabase): Store;
}

const ALL: StoreClass[] = [NSQLite, NSQLiteAuto, NSQLiteFTS, NSQLiteJoin];

const args = Deno.args.filter((arg) => !arg.startsWith('--'));
const flags = new Set(Deno.args.filter((arg) => arg.startsWith('--')));

const real = flags.has('--real');
const DISK = real || flags.has('--disk');
const SKEW = real || flags.has('--skew');
const REPLACEABLE = real || flags.has('--replaceable');

const COUNT = Number(args[0] ?? 50_000);
const AUTHORS = 500;
const TOPICS = 200;

const chosen = args.slice(1);
const classes = chosen.length ? ALL.filter((Store) => chosen.includes(Store.name)) : ALL;

const directory = DISK ? await Deno.makeTempDir({ prefix: 'nsqlite-bench-' }) : undefined;

/** A better-sqlite3 driver that caches prepared statements by SQL text. */
function betterSQLite3(name: string): { db: NSQLiteDatabase; sqlite: BetterSQLite3.Database } {
  const sqlite = new BetterSQLite3(directory ? `${directory}/${name}.db` : ':memory:');

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');

  const statements = new Map<string, BetterSQLite3.Statement>();

  const prepare = (sql: string): BetterSQLite3.Statement => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = sqlite.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };

  return {
    sqlite,
    db: {
      run: (sql, params = []) => void prepare(sql).run(...params as NSQLiteValue[]),
      all: (sql, params = []) => prepare(sql).all(...params as NSQLiteValue[]) as NSQLiteRow[],
      // Left open, so the sizes can be read after the run.
      close: () => {},
    },
  };
}

// ── Dataset ─────────────────────────────────────────────────────────────────

/** A deterministic PRNG, so every store sees the same dataset. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(42);

/**
 * A sampler over `length` buckets.
 *
 * Uniform, or — with `--skew` — Zipf, where bucket `i` is drawn with weight
 * `1/(i+1)`. Real relay traffic looks like the latter: a handful of authors and
 * topics account for most events, and a long tail for the rest. Which one holds
 * decides whether an index is worth driving, so it is the axis most likely to
 * reorder these results.
 */
function sampler(length: number): () => number {
  if (!SKEW) return () => Math.floor(random() * length);

  const cumulative: number[] = [];
  let total = 0;

  for (let i = 0; i < length; i++) {
    total += 1 / (i + 1);
    cumulative.push(total);
  }

  return () => {
    const target = random() * total;

    let low = 0;
    let high = length - 1;

    while (low < high) {
      const mid = (low + high) >> 1;
      if (cumulative[mid] < target) low = mid + 1;
      else high = mid;
    }

    return low;
  };
}

const authors = Array.from({ length: AUTHORS }, (_, i) => i.toString(16).padStart(64, 'a'));
const topics = Array.from({ length: TOPICS }, (_, i) => `topic${i}`);

const pickAuthor = sampler(AUTHORS);
const pickTopic = sampler(TOPICS);

/**
 * Kinds, by share of the dataset. With `--replaceable`, a tenth of the events
 * occupy a coordinate — profiles, relay lists and articles — so writes have to
 * supersede a stored version rather than only append.
 */
const KINDS: number[] = REPLACEABLE
  ? [...Array(55).fill(1), ...Array(20).fill(7), ...Array(15).fill(6), 0, 3, 10002, 10002, 30023, 30023]
  : [1, 1, 1, 6, 7];

/** The `d` tag of an addressable event, drawn from a small set per author. */
const ARTICLES = 8;

// Timestamps ascend across authors rather than within them, so the newest
// events come from many different authors — the case a feed query hits.
const dataset: NostrEvent[] = Array.from({ length: COUNT }, (_, i) => {
  const kind = KINDS[i % KINDS.length];
  const pubkey = authors[pickAuthor()];
  const topic = topics[pickTopic()];

  const tags: string[][] = [
    ['p', authors[pickAuthor()]],
    ['t', topic],
    ...(i % 3 === 0 ? [['e', (i - 1).toString(16).padStart(64, '0')]] : []),
  ];

  if (kind === 30023) {
    tags.push(['d', `article${i % ARTICLES}`]);
  }

  return {
    id: i.toString(16).padStart(64, '0'),
    pubkey,
    created_at: 1_700_000_000 + i,
    kind,
    tags,
    content: `event number ${i} about ${topic}`,
    sig: 'f'.repeat(128),
  };
});

/** Migrate a store and load the dataset into it, returning how long that took. */
async function seed(Store: StoreClass): Promise<Seeded> {
  const { db, sqlite } = betterSQLite3(Store.name);
  const store = new Store(db);
  await store.migrate();

  const started = performance.now();
  for (const event of dataset) {
    await store.event(event);
  }
  const ms = performance.now() - started;

  // Every store gets statistics, since every real deployment has them: SQLite
  // gathers them on `PRAGMA optimize`, which is the standard thing to run
  // periodically and on close. Without them the planner chooses by rule, and
  // a store that names no index is at the mercy of those rules.
  sqlite.exec('ANALYZE');

  return { name: Store.name, store, sqlite, ms };
}

interface Seeded {
  name: string;
  store: Store;
  sqlite: BetterSQLite3.Database;
  ms: number;
}

const stores: Seeded[] = [];
for (const Store of classes) {
  stores.push(await seed(Store));
}

const shape = [
  DISK ? 'on disk' : 'in memory',
  SKEW ? 'zipf authors/topics' : 'uniform authors/topics',
  REPLACEABLE ? 'with replaceable kinds' : 'append only',
].join(', ');

console.log(`\ndataset: ${COUNT} events, ${AUTHORS} authors, ${TOPICS} topics — ${shape}\n`);
console.log(
  `${'benchmark'.padEnd(42)}${stores.map((s) => s.name.padStart(14)).join('')}${
    stores.slice(1).map((s) => `${s.name} ratio`.padStart(22)).join('')
  }`,
);

const row = (name: string, times: number[]) =>
  console.log(
    `${name.padEnd(42)}${times.map((ms) => `${ms.toFixed(3)} ms`.padStart(14)).join('')}${
      times.slice(1).map((ms) => `${(ms / times[0]).toFixed(2)}x`.padStart(22)).join('')
    }`,
  );

row('insert (whole dataset)', stores.map((s) => s.ms));

/**
 * Time a query against every store.
 *
 * Rounds are interleaved and the best one kept, rather than timing each store
 * once in turn. On a busy machine a single pass measures whatever else was
 * running at the time — enough to reverse a ratio — and it lands on whichever
 * store happened to be up. Alternating spreads that noise across all of them,
 * and the minimum is the run that got the least of it.
 */
async function compare(
  name: string,
  fn: (store: Store) => Promise<unknown>,
  iterations = 30,
  rounds = 5,
): Promise<void> {
  for (const { store } of stores) {
    await fn(store); // warm up
  }

  const best = stores.map(() => Infinity);

  for (let round = 0; round < rounds; round++) {
    for (const [i, { store }] of stores.entries()) {
      const started = performance.now();
      for (let n = 0; n < iterations; n++) {
        await fn(store);
      }
      best[i] = Math.min(best[i], (performance.now() - started) / iterations);
    }
  }

  row(name, best);
}

// The head and the tail of the skewed distributions: the author every query
// touches, and the one almost nothing does. Under `--skew` these differ by
// nearly three orders of magnitude in how many events they own, which is the
// whole reason a planner might want to choose differently between them.
const headAuthor = authors[0];
const tailAuthor = authors[AUTHORS - 1];
const headTopic = topics[0];
const tailTopic = topics[TOPICS - 1];

await compare('query by kind (limit 20)', (db) => db.query([{ kinds: [1], limit: 20 }]));
await compare('query by multiple kinds (limit 20)', (db) => db.query([{ kinds: [6, 7], limit: 20 }]));
await compare('query by head author (limit 20)', (db) => db.query([{ authors: [headAuthor], limit: 20 }]));
await compare('query by tail author (limit 20)', (db) => db.query([{ authors: [tailAuthor], limit: 20 }]));
await compare(
  'query by author + kind (limit 20)',
  (db) => db.query([{ authors: [headAuthor], kinds: [1], limit: 20 }]),
);
await compare('query by head topic #t (limit 20)', (db) => db.query([{ '#t': [headTopic], limit: 20 }]));
await compare('query by tail topic #t (limit 20)', (db) => db.query([{ '#t': [tailTopic], limit: 20 }]));
await compare('query by tag #p (limit 20)', (db) => db.query([{ '#p': [headAuthor], limit: 20 }]));
await compare(
  'query by tag #t + kind (limit 20)',
  (db) => db.query([{ '#t': [headTopic], kinds: [1], limit: 20 }]),
);
await compare(
  'query by two tags (limit 20)',
  (db) => db.query([{ '#t': [headTopic], '#p': [headAuthor], limit: 20 }]),
);
await compare(
  'query by tag + author + kind (limit 20)',
  (db) => db.query([{ '#t': [headTopic], authors: [headAuthor], kinds: [1], limit: 20 }]),
);
await compare(
  'query feed (500 authors x 2 kinds, limit 20)',
  (db) => db.query([{ authors, kinds: [1, 6], limit: 20 }]),
  10,
  3,
);
await compare(
  'query by tag with 100 values (limit 20)',
  (db) => db.query([{ '#t': topics.slice(0, 100), limit: 20 }]),
  5,
  3,
);
// The head topic under skew is a sixth of the store, so this is the case where
// a no-limit query has to materialize a large share of it.
await compare('query by head topic #t (no limit)', (db) => db.query([{ '#t': [headTopic] }]), 5, 3);
await compare('query by tail topic #t (no limit)', (db) => db.query([{ '#t': [tailTopic] }]), 10, 3);

if (REPLACEABLE) {
  await compare(
    'query replaceable by author + kind',
    (db) => db.query([{ authors: [headAuthor], kinds: [0, 10002], limit: 20 }]),
  );
  await compare(
    'query addressable by #d',
    (db) => db.query([{ kinds: [30023], '#d': ['article3'], limit: 20 }]),
  );
}

await compare('count by kind', (db) => db.count([{ kinds: [1] }]), 10, 3);
await compare('count by tag #t', (db) => db.count([{ '#t': [headTopic] }]), 10, 3);
// Not a schema comparison for NSQLiteJoin, which scans and matches in memory
// rather than reading a full-text index.
await compare('query by search (limit 20)', (db) => db.query([{ search: 'topic5 ', limit: 20 }]), 5, 3);
await compare(
  'query by search + tag (limit 20)',
  (db) => db.query([{ search: 'topic5 ', '#t': [headTopic], limit: 20 }]),
  5,
  3,
);

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * What each store spent on disk, broken down by table and index.
 *
 * `dbstat` is a compile-time option; without it, only the totals are
 * available, which is still the number that decides whether a design fits in
 * page cache.
 */
console.log('');

for (const { name, sqlite } of stores) {
  sqlite.pragma('wal_checkpoint(TRUNCATE)');

  const [{ bytes }] = sqlite.prepare(
    'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()',
  ).all() as { bytes: number }[];

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  let detail = '';

  try {
    const rows = sqlite.prepare(
      `SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name HAVING bytes > 0 ORDER BY bytes DESC`,
    ).all() as { name: string; bytes: number }[];

    detail = rows.map((r) => `${r.name.replace(/^nostr_/, '')} ${mb(r.bytes)}`).join(', ');
  } catch {
    detail = 'dbstat unavailable';
  }

  console.log(`${name.padEnd(14)} ${mb(bytes).padStart(9)}   ${detail}`);
}

for (const { store, sqlite } of stores) {
  await store.close();
  sqlite.close();
}

if (directory) {
  await Deno.remove(directory, { recursive: true });
}
