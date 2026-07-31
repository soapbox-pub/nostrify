import BetterSQLite3 from 'better-sqlite3';
import type { NostrEvent } from '@nostrify/types';

import { NSQLite } from './NSQLite.ts';
import { NSQLiteJoin } from './NSQLiteJoin.ts';
import type { NSQLiteDatabase, NSQLiteRow, NSQLiteValue } from './types.ts';

// ============================================================================
// NSQLite vs. NSQLiteJoin on a synthetic dataset of a chosen size.
//
// The fixture used by NSQLite.bench.ts is only 1000 events, which understates
// the difference: the relational design's cost grows with how many rows a tag
// matches, while the key/value design's stays flat. Run this to see where each
// one stands at a realistic size.
//
//   deno run -A --no-check scale.bench.ts [event count]
//
// Numbers below `ratio` are NSQLiteJoin ÷ NSQLite, so above 1.0 means NSQLite
// is faster by that factor.
// ============================================================================

type Store = NSQLite | NSQLiteJoin;

const COUNT = Number(Deno.args[0] ?? 50_000);
const AUTHORS = 500;
const TOPICS = 200;

/** A better-sqlite3 driver that caches prepared statements by SQL text. */
function betterSQLite3(): NSQLiteDatabase {
  const sqlite = new BetterSQLite3(':memory:');

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
    run: (sql, params = []) => void prepare(sql).run(...params as NSQLiteValue[]),
    all: (sql, params = []) => prepare(sql).all(...params as NSQLiteValue[]) as NSQLiteRow[],
    close: () => void sqlite.close(),
  };
}

const authors = Array.from({ length: AUTHORS }, (_, i) => i.toString(16).padStart(64, 'a'));
const topics = Array.from({ length: TOPICS }, (_, i) => `topic${i}`);

// Timestamps ascend across authors rather than within them, so the newest
// events come from many different authors — the case a feed query hits.
const dataset: NostrEvent[] = Array.from({ length: COUNT }, (_, i) => ({
  id: i.toString(16).padStart(64, '0'),
  pubkey: authors[i % AUTHORS],
  created_at: 1_700_000_000 + i,
  kind: [1, 1, 1, 6, 7][i % 5],
  tags: [
    ['p', authors[(i * 7) % AUTHORS]],
    ['t', topics[i % TOPICS]],
    ...(i % 3 === 0 ? [['e', (i - 1).toString(16).padStart(64, '0')]] : []),
  ],
  content: `event number ${i} about ${topics[i % TOPICS]}`,
  sig: 'f'.repeat(128),
}));

/** Migrate a store and load the dataset into it, returning how long that took. */
async function seed(Store: new (db: NSQLiteDatabase) => Store): Promise<{ store: Store; ms: number }> {
  const store = new Store(betterSQLite3());
  await store.migrate();

  const started = performance.now();
  for (const event of dataset) {
    await store.event(event);
  }

  return { store, ms: performance.now() - started };
}

const a = await seed(NSQLite);
const b = await seed(NSQLiteJoin);

console.log(`\ndataset: ${COUNT} events, ${AUTHORS} authors, ${TOPICS} topics\n`);
console.log(`${'benchmark'.padEnd(42)} ${'NSQLite'.padStart(11)} ${'NSQLiteJoin'.padStart(12)}   ratio`);

const row = (name: string, ms: number, other: number) =>
  console.log(
    `${name.padEnd(42)} ${ms.toFixed(3).padStart(8)} ms ${other.toFixed(3).padStart(9)} ms   ${
      (other / ms).toFixed(2)
    }x`,
  );

row('insert (whole dataset)', a.ms, b.ms);

/** Time a query against both stores. */
async function compare(name: string, fn: (store: Store) => Promise<unknown>, iterations = 30): Promise<void> {
  const time = async (store: Store): Promise<number> => {
    await fn(store); // warm up
    const started = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fn(store);
    }
    return (performance.now() - started) / iterations;
  };

  row(name, await time(a.store), await time(b.store));
}

await compare('query by kind (limit 20)', (db) => db.query([{ kinds: [1], limit: 20 }]));
await compare('query by author (limit 20)', (db) => db.query([{ authors: [authors[3]], limit: 20 }]));
await compare(
  'query by author + kind (limit 20)',
  (db) => db.query([{ authors: [authors[3]], kinds: [1], limit: 20 }]),
);
await compare('query by tag #t (limit 20)', (db) => db.query([{ '#t': [topics[5]], limit: 20 }]));
await compare('query by tag #p (limit 20)', (db) => db.query([{ '#p': [authors[9]], limit: 20 }]));
await compare(
  'query by tag #t + kind (limit 20)',
  (db) => db.query([{ '#t': [topics[5]], kinds: [1], limit: 20 }]),
);
await compare(
  'query by two tags (limit 20)',
  (db) => db.query([{ '#t': [topics[5]], '#p': [authors[9]], limit: 20 }]),
);
await compare(
  'query feed (500 authors x 2 kinds, limit 20)',
  (db) => db.query([{ authors, kinds: [1, 6], limit: 20 }]),
  10,
);
await compare('count by kind', (db) => db.count([{ kinds: [1] }]), 10);
await compare('count by tag #t', (db) => db.count([{ '#t': [topics[5]] }]), 10);
// Not a schema comparison: NSQLite answers keywords from an FTS5 index, while
// NSQLiteJoin scans and matches in memory.
await compare('query by search (limit 20)', (db) => db.query([{ search: 'topic5 ', limit: 20 }]), 5);

await a.store.close();
await b.store.close();
