import { afterEach, beforeEach, describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';

import 'fake-indexeddb/auto';
import type { NostrEvent } from '@nostrify/types';

import { NIndexedDB, type NIndexedDBOpts } from './NIndexedDB.ts';

// Each test gets a fresh, uniquely-named database so there's no cross-test
// state. `fake-indexeddb/auto` installs a global IndexedDB implementation.

let store: NIndexedDB;
let counter = 0;
const openedDbNames: string[] = [];
/** Track stores so their connections can be closed (and the loop drained) after each test. */
const openStores: NIndexedDB[] = [];

/** Construct a store backed by a fresh, uniquely-named database. */
function newStore(opts: NIndexedDBOpts = {}): NIndexedDB {
  const name = `test-events-${Date.now()}-${counter++}`;
  openedDbNames.push(name);
  const store = new NIndexedDB(name, opts);
  openStores.push(store);
  return store;
}

beforeEach(() => {
  openedDbNames.length = 0;
  store = newStore();
});

afterEach(async () => {
  // Close every connection opened during the test so its underlying handle
  // doesn't keep the event loop alive (which would hang `node --test`).
  for (const store of openStores.splice(0)) {
    await store.close();
  }
  for (const name of openedDbNames) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
});

/** Open an additional store with custom options, tracked for cleanup. */
function openStore(opts: NIndexedDBOpts = {}): NIndexedDB {
  return newStore(opts);
}

/** Build a minimal valid-shaped event. The id is deterministic-ish for tests. */
function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const id = overrides.id ?? `${'0'.repeat(63)}${(counter++ % 16).toString(16)}`;
  return {
    id,
    pubkey: 'a'.repeat(64),
    created_at: 1000,
    kind: 1,
    tags: [],
    content: '',
    sig: 'f'.repeat(128),
    ...overrides,
  };
}

const PK1 = 'a'.repeat(64);
const PK2 = 'b'.repeat(64);

/** Insert events and return once they've been flushed. */
async function add(...events: NostrEvent[]): Promise<void> {
  await Promise.all(events.map((e) => store.event(e)));
}

const ids = (events: NostrEvent[]): string[] => events.map((e) => e.id);

await describe('NIndexedDB', () => {
  describe('ids filter', () => {
    it('returns events by exact id', async () => {
      const a = makeEvent({ id: '1'.repeat(64) });
      const b = makeEvent({ id: '2'.repeat(64) });
      await add(a, b);

      const result = await store.query([{ ids: [a.id] }]);
      deepStrictEqual(ids(result), [a.id]);
    });

    it('returns nothing for an empty ids array', async () => {
      await add(makeEvent({ id: '1'.repeat(64) }));
      const result = await store.query([{ ids: [] }]);
      deepStrictEqual(result, []);
    });
  });

  describe('authors filter', () => {
    it('returns events by a single author newest-first', async () => {
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, created_at: 100 });
      const recent = makeEvent({ id: '2'.repeat(64), pubkey: PK1, created_at: 200 });
      const other = makeEvent({ id: '3'.repeat(64), pubkey: PK2, created_at: 150 });
      await add(old, recent, other);

      const result = await store.query([{ authors: [PK1] }]);
      deepStrictEqual(ids(result), [recent.id, old.id]);
    });
  });

  describe('kinds filter', () => {
    it('returns events of the given kinds', async () => {
      const k1 = makeEvent({ id: '1'.repeat(64), kind: 1 });
      const k7 = makeEvent({ id: '2'.repeat(64), kind: 7 });
      await add(k1, k7);

      const result = await store.query([{ kinds: [7] }]);
      deepStrictEqual(ids(result), [k7.id]);
    });

    it('combines multiple kinds in one filter', async () => {
      const k1 = makeEvent({ id: '1'.repeat(64), kind: 1, created_at: 100 });
      const k6 = makeEvent({ id: '2'.repeat(64), kind: 6, created_at: 200 });
      const k7 = makeEvent({ id: '3'.repeat(64), kind: 7, created_at: 150 });
      await add(k1, k6, k7);

      const result = await store.query([{ kinds: [1, 6] }]);
      deepStrictEqual(ids(result), [k6.id, k1.id]);
    });
  });

  describe('authors + kinds (pubkeyKind index)', () => {
    it('intersects authors and kinds', async () => {
      const match = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1 });
      const wrongKind = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 7 });
      const wrongAuthor = makeEvent({ id: '3'.repeat(64), pubkey: PK2, kind: 1 });
      await add(match, wrongKind, wrongAuthor);

      const result = await store.query([{ authors: [PK1], kinds: [1] }]);
      deepStrictEqual(ids(result), [match.id]);
    });
  });

  describe('tag filters', () => {
    it('returns events with a matching #e tag', async () => {
      const target = 'c'.repeat(64);
      const tagged = makeEvent({ id: '1'.repeat(64), tags: [['e', target]] });
      const untagged = makeEvent({ id: '2'.repeat(64), tags: [] });
      await add(tagged, untagged);

      const result = await store.query([{ '#e': [target] }]);
      deepStrictEqual(ids(result), [tagged.id]);
    });

    it('does not match a tag value that is only a prefix', async () => {
      const tagged = makeEvent({ id: '1'.repeat(64), tags: [['t', 'foobar']] });
      await add(tagged);

      const result = await store.query([{ '#t': ['foo'] }]);
      deepStrictEqual(result, []);
    });

    it('picks the most selective tag and post-filters the rest', async () => {
      // Two tag conditions: #t has many values, #e has one. The planner scans
      // #e, then post-filters #t.
      const match = makeEvent({ id: '1'.repeat(64), tags: [['e', 'c'.repeat(64)], ['t', 'nostr']] });
      const wrongT = makeEvent({ id: '2'.repeat(64), tags: [['e', 'c'.repeat(64)], ['t', 'other']] });
      await add(match, wrongT);

      const result = await store.query([{ '#e': ['c'.repeat(64)], '#t': ['nostr', 'bitcoin'] }]);
      deepStrictEqual(ids(result), [match.id]);
    });

    it('does not confuse name+value boundaries (no concatenation collision)', async () => {
      // Under a naive `name + value` concatenation, #e="aXXX" and #ea="XXX"
      // would both produce the token "eaXXX" and collide. Separate key
      // elements keep them distinct.
      const value = 'X'.repeat(63);
      const eTag = makeEvent({ id: '1'.repeat(64), tags: [['e', 'a' + value]] });
      const eaTag = makeEvent({ id: '2'.repeat(64), tags: [['ea', value]] });
      await add(eTag, eaTag);

      const eResult = await store.query([{ '#e': ['a' + value] }]);
      deepStrictEqual(ids(eResult), [eTag.id]);
    });

    it('supports multi-letter tag names', async () => {
      // Default indexTags only indexes single-letter tags, so use a custom
      // policy that also indexes #proxy.
      const custom = openStore({
        indexTags: (event) =>
          event.tags.filter(([name, value]) => (name.length === 1 || name === 'proxy') && !!value),
      });
      const proxied = makeEvent({ id: '1'.repeat(64), tags: [['proxy', 'https://example.com/1']] });
      const other = makeEvent({ id: '2'.repeat(64), tags: [['proxy', 'https://example.com/2']] });
      await Promise.all([proxied, other].map((e) => custom.event(e)));

      const result = await custom.query([{ '#proxy': ['https://example.com/1'] }]);
      deepStrictEqual(ids(result), [proxied.id]);
    });
  });

  describe('configurable indexTags', () => {
    it('only indexes tags returned by the policy', async () => {
      // Index #t but NOT #e.
      const custom = openStore({
        indexTags: (event) => event.tags.filter(([name]) => name === 't'),
      });
      const event = makeEvent({ id: '1'.repeat(64), tags: [['t', 'nostr'], ['e', 'c'.repeat(64)]] });
      await custom.event(event);

      // #t is indexed → found.
      deepStrictEqual(ids(await custom.query([{ '#t': ['nostr'] }])), [event.id]);
      // #e is not indexed → a tag-driven query returns nothing.
      deepStrictEqual(await custom.query([{ '#e': ['c'.repeat(64)] }]), []);
    });

    it('default policy excludes tag values of 200+ chars', async () => {
      const longValue = 'x'.repeat(200);
      const okValue = 'y'.repeat(199);
      const event = makeEvent({ id: '1'.repeat(64), tags: [['t', longValue], ['t', okValue]] });
      await add(event);

      // The 199-char value is indexed.
      deepStrictEqual(ids(await store.query([{ '#t': [okValue] }])), [event.id]);
      // The 200-char value is not.
      deepStrictEqual(await store.query([{ '#t': [longValue] }]), []);
    });
  });

  describe('since / until', () => {
    it('applies inclusive time bounds', async () => {
      const e1 = makeEvent({ id: '1'.repeat(64), pubkey: PK1, created_at: 100 });
      const e2 = makeEvent({ id: '2'.repeat(64), pubkey: PK1, created_at: 200 });
      const e3 = makeEvent({ id: '3'.repeat(64), pubkey: PK1, created_at: 300 });
      await add(e1, e2, e3);

      const result = await store.query([{ authors: [PK1], since: 150, until: 250 }]);
      deepStrictEqual(ids(result), [e2.id]);
    });
  });

  describe('limit', () => {
    it('truncates to the newest N events', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `${i}`.repeat(64), pubkey: PK1, created_at: 100 + i }));
      await add(...events);

      const result = await store.query([{ authors: [PK1], limit: 2 }]);
      deepStrictEqual(result.map((e) => e.created_at), [104, 103]);
    });
  });

  describe('full scan fallback', () => {
    it('returns everything when no major field is given', async () => {
      const e1 = makeEvent({ id: '1'.repeat(64), created_at: 100 });
      const e2 = makeEvent({ id: '2'.repeat(64), created_at: 200 });
      await add(e1, e2);

      const result = await store.query([{}]);
      deepStrictEqual(ids(result), [e2.id, e1.id]);
    });
  });

  describe('multiple filters (OR + dedupe)', () => {
    it('unions results and de-duplicates by id', async () => {
      const a = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1, created_at: 100 });
      const b = makeEvent({ id: '2'.repeat(64), pubkey: PK2, kind: 7, created_at: 200 });
      await add(a, b);

      // Both filters match `a`; it should appear once.
      const result = await store.query([{ authors: [PK1] }, { ids: [a.id] }, { kinds: [7] }]);
      deepStrictEqual(ids(result).sort(), [a.id, b.id].sort());
      deepStrictEqual(result.length, 2);
    });
  });

  describe('replaceable supersession', () => {
    it('keeps only the newest replaceable event per (pubkey, kind)', async () => {
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 0, created_at: 100, content: 'old' });
      await add(old);
      const fresh = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 0, created_at: 200, content: 'new' });
      await add(fresh);

      const result = await store.query([{ kinds: [0], authors: [PK1] }]);
      deepStrictEqual(result.map((e) => e.content), ['new']);
    });

    it('does not overwrite a newer replaceable event with an older one', async () => {
      const fresh = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 0, created_at: 200, content: 'new' });
      await add(fresh);
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 0, created_at: 100, content: 'old' });
      await add(old);

      const result = await store.query([{ kinds: [0], authors: [PK1] }]);
      deepStrictEqual(result.map((e) => e.content), ['new']);
    });

    it('keeps separate addressable events per d-tag', async () => {
      const listA = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'a']] });
      const listB = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'b']] });
      await add(listA, listB);

      const result = await store.query([{ kinds: [30000], authors: [PK1] }]);
      deepStrictEqual(result.length, 2);
    });

    it('supersedes addressable events sharing a d-tag', async () => {
      const oldList = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'a']], content: 'old' });
      await add(oldList);
      const newList = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 30000, created_at: 200, tags: [['d', 'a']], content: 'new' });
      await add(newList);

      const result = await store.query([{ kinds: [30000], authors: [PK1], '#d': ['a'] }]);
      deepStrictEqual(result.map((e) => e.content), ['new']);
    });
  });

  describe('stored events are returned clean', () => {
    it('does not leak derived index fields', async () => {
      const e = makeEvent({ id: '1'.repeat(64), tags: [['e', 'c'.repeat(64)]] });
      await add(e);

      const [result] = await store.query([{ ids: [e.id] }]);
      ok(!('_tagsCreated' in result));
      deepStrictEqual(
        Object.keys(result).sort(),
        ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags'],
      );
    });
  });

  describe('count and remove', () => {
    it('counts matching events', async () => {
      await add(
        makeEvent({ id: '1'.repeat(64), pubkey: PK1 }),
        makeEvent({ id: '2'.repeat(64), pubkey: PK1 }),
      );
      const { count } = await store.count([{ authors: [PK1] }]);
      deepStrictEqual(count, 2);
    });

    it('removes matching events', async () => {
      const a = makeEvent({ id: '1'.repeat(64), pubkey: PK1 });
      const b = makeEvent({ id: '2'.repeat(64), pubkey: PK2 });
      await add(a, b);

      await store.remove([{ authors: [PK1] }]);

      const remaining = await store.query([{}]);
      deepStrictEqual(ids(remaining), [b.id]);
    });
  });

  describe('ephemeral events', () => {
    it('are never stored', async () => {
      await add(makeEvent({ id: '1'.repeat(64), kind: 20000 }));
      const result = await store.query([{ kinds: [20000] }]);
      deepStrictEqual(result, []);
    });
  });

  describe('NIP-09 deletions (kind 5)', () => {
    it('deletes own event referenced by an e tag', async () => {
      const note = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1 });
      await add(note);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', note.id], ['k', '1']],
      }));

      deepStrictEqual(await store.query([{ ids: [note.id] }]), []);
    });

    it("does not delete another author's event referenced by an e tag", async () => {
      const note = makeEvent({ id: '1'.repeat(64), pubkey: PK2, kind: 1 });
      await add(note);

      // PK1 maliciously requests deletion of PK2's note.
      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', note.id]],
      }));

      deepStrictEqual(ids(await store.query([{ ids: [note.id] }])), [note.id]);
    });

    it('deletes own addressable event referenced by an a tag', async () => {
      const article = makeEvent({
        id: '1'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 1000,
        tags: [['d', 'hello']],
      });
      await add(article);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:hello`], ['k', '30023']],
      }));

      deepStrictEqual(await store.query([{ kinds: [30023], authors: [PK1] }]), []);
    });

    it('does not delete a different d-tag at the same coordinate', async () => {
      const keep = makeEvent({
        id: '2'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 1000,
        tags: [['d', 'keep']],
      });
      await add(keep);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:other`]],
      }));

      deepStrictEqual(ids(await store.query([{ kinds: [30023] }])), [keep.id]);
    });

    it('keeps a replacement newer than the deletion request (a tag)', async () => {
      const newer = makeEvent({
        id: '3'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 3000,
        tags: [['d', 'hello']],
      });
      await add(newer);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:hello`]],
      }));

      deepStrictEqual(ids(await store.query([{ kinds: [30023] }])), [newer.id]);
    });

    it('retains the deletion request event itself', async () => {
      const del = makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', '1'.repeat(64)]],
      });
      await add(del);

      deepStrictEqual(ids(await store.query([{ kinds: [5] }])), [del.id]);
    });
  });
});
