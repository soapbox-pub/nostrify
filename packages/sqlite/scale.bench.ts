import BetterSQLite3 from 'better-sqlite3';
import type { NostrEvent } from '@nostrify/types';

import { NSQLite } from './NSQLite.ts';
import type { NSQLiteDatabase, NSQLiteRow, NSQLiteValue } from './types.ts';

// ============================================================================
// NSQLite on a synthetic dataset of a chosen size and shape.
//
// The fixture used by NSQLite.bench.ts is only 1000 events, at which size
// deserializing events dominates and every query shape looks alike. This one
// builds a store of any size and shape, which is where the cost of a query
// strategy actually shows.
//
//   deno run -A --no-check scale.bench.ts [count] [flags…]
//
//     --disk         back the store with a file instead of :memory:, so page
//                    cache misses and WAL fsyncs count
//     --skew         draw authors and topics from a Zipf distribution rather
//                    than uniformly, which is what decides whether an index is
//                    worth driving
//     --replaceable  mix in replaceable and addressable kinds, so writes
//                    exercise supersession rather than only appending
//     --real         all three of the above
//     --burst        hand events over concurrently rather than awaiting each in
//                    turn, which is how a relay or a sync loop feeds a store,
//                    and the only shape in which write batching can do anything
//
// Each row is the best of five interleaved rounds — see `measure`.
// ============================================================================

const args = Deno.args.filter((arg) => !arg.startsWith('--'));
const flags = new Set(Deno.args.filter((arg) => arg.startsWith('--')));

const real = flags.has('--real');
const DISK = real || flags.has('--disk');
const SKEW = real || flags.has('--skew');
const REPLACEABLE = real || flags.has('--replaceable');
const BURST = flags.has('--burst');

/** Events handed over at once under `--burst`. */
const BURST_SIZE = 500;

const COUNT = Number(args[0] ?? 50_000);
const AUTHORS = 500;
const TOPICS = 200;

const directory = DISK ? await Deno.makeTempDir({ prefix: 'nsqlite-bench-' }) : undefined;

/** A better-sqlite3 driver that caches prepared statements by SQL text. */
function betterSQLite3(): { db: NSQLiteDatabase; sqlite: BetterSQLite3.Database } {
  const sqlite = new BetterSQLite3(directory ? `${directory}/nsqlite.db` : ':memory:');

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

/** Migrate the store and load the dataset into it, returning how long that took. */
async function seed(): Promise<Seeded> {
  const { db, sqlite } = betterSQLite3();
  const store = new NSQLite(db);
  await store.migrate();

  const started = performance.now();

  if (BURST) {
    // Awaiting each event in turn gives a store nothing to batch: there is only
    // ever one write in flight. A relay is fed by many connections at once, so
    // this is the shape that decides what ingest actually costs.
    for (let i = 0; i < dataset.length; i += BURST_SIZE) {
      await Promise.all(dataset.slice(i, i + BURST_SIZE).map((event) => store.event(event)));
    }
  } else {
    for (const event of dataset) {
      await store.event(event);
    }
  }

  const ms = performance.now() - started;

  // Statistics are gathered because every real deployment has them, not
  // because these plans need them: every scan names its index with `INDEXED
  // BY` or fixes its join order with `CROSS JOIN`, so the numbers below are
  // the same with or without this line. That is the point of planning by hand.
  sqlite.exec('ANALYZE');

  return { store, sqlite, ms };
}

interface Seeded {
  store: NSQLite;
  sqlite: BetterSQLite3.Database;
  ms: number;
}

const { store, sqlite, ms: insertMs } = await seed();

const shape = [
  DISK ? 'on disk' : 'in memory',
  SKEW ? 'zipf authors/topics' : 'uniform authors/topics',
  REPLACEABLE ? 'with replaceable kinds' : 'append only',
  BURST ? `ingested ${BURST_SIZE} at a time` : 'ingested one at a time',
].join(', ');

console.log(`\ndataset: ${COUNT} events, ${AUTHORS} authors, ${TOPICS} topics — ${shape}\n`);
console.log(`${'benchmark'.padEnd(44)}${'per call'.padStart(14)}`);

const row = (name: string, ms: number) => console.log(`${name.padEnd(44)}${`${ms.toFixed(3)} ms`.padStart(14)}`);

row('insert (whole dataset)', insertMs);
row('insert (per event)', insertMs / COUNT);

/**
 * Time a query.
 *
 * The best of several rounds is kept rather than the mean of one. On a busy
 * machine a single pass measures whatever else was running at the time, by
 * enough to change a number severalfold, and there is no averaging that back
 * out — so the minimum, being the round that got the least interference, is
 * the closest thing to the cost of the query itself.
 */
async function measure(
  name: string,
  fn: (store: NSQLite) => Promise<unknown>,
  iterations = 30,
  rounds = 5,
): Promise<void> {
  await fn(store); // warm up

  let best = Infinity;

  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    for (let n = 0; n < iterations; n++) {
      await fn(store);
    }
    best = Math.min(best, (performance.now() - started) / iterations);
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

await measure('query by kind (limit 20)', (db) => db.query([{ kinds: [1], limit: 20 }]));
await measure('query by multiple kinds (limit 20)', (db) => db.query([{ kinds: [6, 7], limit: 20 }]));
await measure('query by head author (limit 20)', (db) => db.query([{ authors: [headAuthor], limit: 20 }]));
await measure('query by tail author (limit 20)', (db) => db.query([{ authors: [tailAuthor], limit: 20 }]));
await measure(
  'query by author + kind (limit 20)',
  (db) => db.query([{ authors: [headAuthor], kinds: [1], limit: 20 }]),
);
await measure('query by head topic #t (limit 20)', (db) => db.query([{ '#t': [headTopic], limit: 20 }]));
await measure('query by tail topic #t (limit 20)', (db) => db.query([{ '#t': [tailTopic], limit: 20 }]));
await measure('query by tag #p (limit 20)', (db) => db.query([{ '#p': [headAuthor], limit: 20 }]));
await measure(
  'query by tag #t + kind (limit 20)',
  (db) => db.query([{ '#t': [headTopic], kinds: [1], limit: 20 }]),
);
await measure(
  'query by two tags (limit 20)',
  (db) => db.query([{ '#t': [headTopic], '#p': [headAuthor], limit: 20 }]),
);
await measure(
  'query by tag + author + kind (limit 20)',
  (db) => db.query([{ '#t': [headTopic], authors: [headAuthor], kinds: [1], limit: 20 }]),
);
await measure(
  'query feed (500 authors x 2 kinds, limit 20)',
  (db) => db.query([{ authors, kinds: [1, 6], limit: 20 }]),
  10,
  3,
);
await measure(
  'query by tag with 100 values (limit 20)',
  (db) => db.query([{ '#t': topics.slice(0, 100), limit: 20 }]),
  5,
  3,
);
// The head topic under skew is a sixth of the store, so this is the case where
// a no-limit query has to materialize a large share of it.
await measure('query by head topic #t (no limit)', (db) => db.query([{ '#t': [headTopic] }]), 5, 3);
await measure('query by tail topic #t (no limit)', (db) => db.query([{ '#t': [tailTopic] }]), 10, 3);

if (REPLACEABLE) {
  await measure(
    'query replaceable by author + kind',
    (db) => db.query([{ authors: [headAuthor], kinds: [0, 10002], limit: 20 }]),
  );
  await measure(
    'query addressable by #d',
    (db) => db.query([{ kinds: [30023], '#d': ['article3'], limit: 20 }]),
  );
}

await measure('count by kind', (db) => db.count([{ kinds: [1] }]), 10, 3);
await measure('count by tag #t', (db) => db.count([{ '#t': [headTopic] }]), 10, 3);
await measure('query by search (limit 20)', (db) => db.query([{ search: 'topic5 ', limit: 20 }]), 5, 3);
await measure(
  'query by search + tag (limit 20)',
  (db) => db.query([{ search: 'topic5 ', '#t': [headTopic], limit: 20 }]),
  5,
  3,
);

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * What the store spent on disk, broken down by table and index.
 *
 * `dbstat` is a compile-time option; without it, only the total is available,
 * which is still the number that decides whether the store fits in page cache.
 */
console.log('');

sqlite.pragma('wal_checkpoint(TRUNCATE)');

const [{ bytes }] = sqlite.prepare(
  'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()',
).all() as { bytes: number }[];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

console.log(`total ${mb(bytes)}, ${(bytes / COUNT).toFixed(0)} bytes per event`);

try {
  const rows = sqlite.prepare(
    `SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name HAVING bytes > 0 ORDER BY bytes DESC`,
  ).all() as { name: string; bytes: number }[];

  for (const r of rows) {
    console.log(`  ${r.name.replace(/^nostr_/, '').padEnd(34)}${mb(r.bytes).padStart(9)}`);
  }
} catch {
  console.log('  (dbstat unavailable)');
}

await store.close();
sqlite.close();

if (directory) {
  await Deno.remove(directory, { recursive: true });
}
