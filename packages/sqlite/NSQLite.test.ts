import { afterEach, describe, it } from 'node:test';
import { deepStrictEqual, ok, rejects } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

import type { NostrEvent } from '@nostrify/types';

import { NSQLite } from './NSQLite.ts';
import { NSQLiteAuto } from './NSQLiteAuto.ts';
import { NSQLiteFTS } from './NSQLiteFTS.ts';
import { NSQLiteJoin } from './NSQLiteJoin.ts';
import type { NSQLiteDatabase, NSQLiteOpts, NSQLiteRow, NSQLiteValue } from './types.ts';

/**
 * The `node:sqlite` driver. Every method the stores need is a one-liner, which
 * is the point of {@link NSQLiteDatabase} — any SQLite library can back it.
 */
function nodeSQLite(sqlite: DatabaseSync): NSQLiteDatabase {
  return {
    run: (sql, params = []) => void sqlite.prepare(sql).run(...params as never[]),
    all: (sql, params = []) => sqlite.prepare(sql).all(...params as never[]) as NSQLiteRow[],
    close: () => sqlite.close(),
  };
}

/**
 * The implementations share an interface and their semantics, so they share a
 * test suite. Anything any one of them gets wrong shows up here.
 */
type Store = NSQLite | NSQLiteAuto | NSQLiteFTS | NSQLiteJoin;

interface StoreClass {
  new (db: NSQLiteDatabase, opts?: NSQLiteOpts): Store;
}

/** Stores opened during a test, closed afterwards. */
const openStores: Store[] = [];

afterEach(async () => {
  for (const store of openStores.splice(0)) {
    await store.close();
  }
});

let counter = 0;

/** Build a minimal valid-shaped event. */
function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const id = overrides.id ?? `${'0'.repeat(58)}${(counter++).toString(16).padStart(6, '0')}`;
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

const ids = (events: NostrEvent[]): string[] => events.map((e) => e.id);

/** Insert events into a store, in order. */
async function add(store: Store, ...events: NostrEvent[]): Promise<void> {
  for (const event of events) {
    await store.event(event);
  }
}

for (const Store of [NSQLite, NSQLiteAuto, NSQLiteFTS, NSQLiteJoin] as StoreClass[]) {
  /** Open a store backed by a fresh in-memory database. */
  const openStore = async (opts: NSQLiteOpts = {}): Promise<Store> => {
    const store = new Store(nodeSQLite(new DatabaseSync(':memory:')), opts);
    openStores.push(store);
    await store.migrate();
    return store;
  };

  await describe(Store.name, () => {
    describe('migrate', () => {
      it('is idempotent', async () => {
        const store = await openStore();
        await store.migrate();
        await store.migrate();
        deepStrictEqual(await store.query([{}]), []);
      });
    });

    describe('ids filter', () => {
      it('returns events by exact id', async () => {
        const store = await openStore();
        const a = makeEvent({ id: '1'.repeat(64) });
        const b = makeEvent({ id: '2'.repeat(64) });
        await add(store, a, b);

        deepStrictEqual(await store.query([{ ids: [a.id] }]), [a]);
      });

      it('returns nothing for an empty ids array', async () => {
        const store = await openStore();
        await add(store, makeEvent());

        deepStrictEqual(await store.query([{ ids: [] }]), []);
      });

      it('applies since and until to id lookups', async () => {
        const store = await openStore();
        const a = makeEvent({ created_at: 1000 });
        await add(store, a);

        deepStrictEqual(await store.query([{ ids: [a.id], since: 1001 }]), []);
        deepStrictEqual(await store.query([{ ids: [a.id], until: 1000 }]), [a]);
      });
    });

    describe('authors filter', () => {
      it("returns an author's events newest-first", async () => {
        const store = await openStore();
        const older = makeEvent({ pubkey: PK1, created_at: 1000 });
        const newer = makeEvent({ pubkey: PK1, created_at: 2000 });
        const other = makeEvent({ pubkey: PK2, created_at: 3000 });
        await add(store, older, newer, other);

        deepStrictEqual(ids(await store.query([{ authors: [PK1] }])), [newer.id, older.id]);
      });

      it('returns events for multiple authors', async () => {
        const store = await openStore();
        const a = makeEvent({ pubkey: PK1, created_at: 1000 });
        const b = makeEvent({ pubkey: PK2, created_at: 2000 });
        await add(store, a, b);

        deepStrictEqual(ids(await store.query([{ authors: [PK1, PK2] }])), [b.id, a.id]);
      });
    });

    describe('kinds filter', () => {
      it('returns events of one kind', async () => {
        const store = await openStore();
        const note = makeEvent({ kind: 1 });
        const reaction = makeEvent({ kind: 7 });
        await add(store, note, reaction);

        deepStrictEqual(await store.query([{ kinds: [1] }]), [note]);
      });

      it('returns events of multiple kinds', async () => {
        const store = await openStore();
        const note = makeEvent({ kind: 1, created_at: 1000 });
        const repost = makeEvent({ kind: 6, created_at: 2000 });
        const reaction = makeEvent({ kind: 7, created_at: 3000 });
        await add(store, note, repost, reaction);

        deepStrictEqual(ids(await store.query([{ kinds: [6, 7] }])), [reaction.id, repost.id]);
      });
    });

    describe('authors and kinds', () => {
      it('intersects both conditions', async () => {
        const store = await openStore();
        const wanted = makeEvent({ pubkey: PK1, kind: 1 });
        const wrongKind = makeEvent({ pubkey: PK1, kind: 7 });
        const wrongAuthor = makeEvent({ pubkey: PK2, kind: 1 });
        await add(store, wanted, wrongKind, wrongAuthor);

        deepStrictEqual(await store.query([{ authors: [PK1], kinds: [1] }]), [wanted]);
      });
    });

    describe('tag filters', () => {
      it('returns events carrying the tag', async () => {
        const store = await openStore();
        const tagged = makeEvent({ tags: [['e', 'x'.repeat(64)]] });
        const untagged = makeEvent();
        await add(store, tagged, untagged);

        deepStrictEqual(await store.query([{ '#e': ['x'.repeat(64)] }]), [tagged]);
      });

      it('does not match on a value prefix', async () => {
        const store = await openStore();
        await add(store, makeEvent({ tags: [['t', 'nostrich']] }));

        deepStrictEqual(await store.query([{ '#t': ['nostr'] }]), []);
      });

      it('does not confuse the tag name with the tag value', async () => {
        const store = await openStore();
        // With a naive `name + value` key these two would collide.
        const a = makeEvent({ tags: [['e', 'aXXX']] });
        const b = makeEvent({ tags: [['a', 'eXXX']] });
        await add(store, a, b);

        deepStrictEqual(await store.query([{ '#e': ['aXXX'] }]), [a]);
        deepStrictEqual(await store.query([{ '#a': ['eXXX'] }]), [b]);
      });

      it('scans the most selective tag and matches the rest in memory', async () => {
        const store = await openStore();
        const both = makeEvent({ tags: [['t', 'a'], ['p', PK2]] });
        const onlyT = makeEvent({ tags: [['t', 'a']] });
        const onlyP = makeEvent({ tags: [['p', PK2]] });
        await add(store, both, onlyT, onlyP);

        deepStrictEqual(await store.query([{ '#t': ['a', 'b', 'c'], '#p': [PK2] }]), [both]);
      });

      it('combines a tag with kinds', async () => {
        const store = await openStore();
        const note = makeEvent({ kind: 1, tags: [['e', 'x']], created_at: 1000 });
        const reaction = makeEvent({ kind: 7, tags: [['e', 'x']], created_at: 2000 });
        await add(store, note, reaction);

        deepStrictEqual(await store.query([{ '#e': ['x'], kinds: [7] }]), [reaction]);
      });

      it('matches nothing for a tag the index policy excludes', async () => {
        const store = await openStore();
        await add(store, makeEvent({ tags: [['proxy', 'https://example.com']] }));

        deepStrictEqual(await store.query([{ '#proxy': ['https://example.com'] }]), []);
      });
    });

    describe('configurable indexTags', () => {
      it('only indexes the tags the policy returns', async () => {
        const store = await openStore({ indexTags: (event) => event.tags.filter(([name]) => name === 't') });
        const event = makeEvent({ tags: [['t', 'nostr'], ['e', 'x']] });
        await add(store, event);

        deepStrictEqual(await store.query([{ '#t': ['nostr'] }]), [event]);
        deepStrictEqual(await store.query([{ '#e': ['x'] }]), []);
      });

      it('can index multi-letter tag names', async () => {
        const store = await openStore({ indexTags: (event) => event.tags });
        const event = makeEvent({ tags: [['proxy', 'https://example.com']] });
        await add(store, event);

        deepStrictEqual(await store.query([{ '#proxy': ['https://example.com'] }]), [event]);
      });

      it('excludes values of 200 characters or more by default', async () => {
        const store = await openStore();
        const ok199 = makeEvent({ tags: [['t', 'a'.repeat(199)]] });
        const too200 = makeEvent({ tags: [['t', 'b'.repeat(200)]] });
        await add(store, ok199, too200);

        deepStrictEqual(await store.query([{ '#t': ['a'.repeat(199)] }]), [ok199]);
        deepStrictEqual(await store.query([{ '#t': ['b'.repeat(200)] }]), []);
      });
    });

    describe('since and until', () => {
      it('applies inclusive bounds', async () => {
        const store = await openStore();
        const a = makeEvent({ created_at: 1000 });
        const b = makeEvent({ created_at: 2000 });
        const c = makeEvent({ created_at: 3000 });
        await add(store, a, b, c);

        deepStrictEqual(ids(await store.query([{ since: 2000 }])), [c.id, b.id]);
        deepStrictEqual(ids(await store.query([{ until: 2000 }])), [b.id, a.id]);
        deepStrictEqual(ids(await store.query([{ since: 2000, until: 2000 }])), [b.id]);
      });
    });

    describe('limit', () => {
      it('returns the newest N events', async () => {
        const store = await openStore();
        const events = [1000, 2000, 3000].map((created_at) => makeEvent({ created_at }));
        await add(store, ...events);

        deepStrictEqual(ids(await store.query([{ limit: 2 }])), [events[2].id, events[1].id]);
      });

      it('applies the limit globally across cursors, not per cursor', async () => {
        const store = await openStore();
        // Three authors, newest events interleaved: a global limit of 2 must
        // return the two newest overall, not two from each author.
        const a = makeEvent({ pubkey: PK1, created_at: 3000 });
        const b = makeEvent({ pubkey: PK2, created_at: 2000 });
        const c = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, a, b, c);

        deepStrictEqual(ids(await store.query([{ authors: [PK1, PK2], limit: 2 }])), [a.id, b.id]);
      });

      it('does not count an event twice when it matches several tag values', async () => {
        const store = await openStore();
        const both = makeEvent({ tags: [['t', 'a'], ['t', 'b']], created_at: 3000 });
        const other = makeEvent({ tags: [['t', 'a']], created_at: 2000 });
        await add(store, both, other);

        deepStrictEqual(ids(await store.query([{ '#t': ['a', 'b'], limit: 2 }])), [both.id, other.id]);
      });

      it('returns nothing for a limit of 0', async () => {
        const store = await openStore();
        await add(store, makeEvent());

        deepStrictEqual(await store.query([{ limit: 0 }]), []);
      });
    });

    describe('full scan fallback', () => {
      it('returns everything for an empty filter', async () => {
        const store = await openStore();
        const a = makeEvent({ created_at: 1000 });
        const b = makeEvent({ created_at: 2000 });
        await add(store, a, b);

        deepStrictEqual(ids(await store.query([{}])), [b.id, a.id]);
      });
    });

    describe('multiple filters', () => {
      it('ORs the filters and de-duplicates by id', async () => {
        const store = await openStore();
        const note = makeEvent({ kind: 1, pubkey: PK1, created_at: 2000 });
        const reaction = makeEvent({ kind: 7, pubkey: PK2, created_at: 1000 });
        await add(store, note, reaction);

        // `note` matches both filters but must appear once.
        const events = await store.query([{ kinds: [1] }, { authors: [PK1] }, { kinds: [7] }]);
        deepStrictEqual(ids(events), [note.id, reaction.id]);
      });
    });

    describe('replaceable events', () => {
      it('keeps only the newest version per (pubkey, kind)', async () => {
        const store = await openStore();
        const older = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000 });
        const newer = makeEvent({ kind: 0, pubkey: PK1, created_at: 2000 });
        await add(store, older, newer);

        deepStrictEqual(await store.query([{ kinds: [0] }]), [newer]);
      });

      it('does not let an older version overwrite a newer one', async () => {
        const store = await openStore();
        const newer = makeEvent({ kind: 0, pubkey: PK1, created_at: 2000 });
        const older = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000 });
        await add(store, newer, older);

        deepStrictEqual(await store.query([{ kinds: [0] }]), [newer]);
      });

      it('keeps versions from different authors', async () => {
        const store = await openStore();
        const one = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000 });
        const two = makeEvent({ kind: 0, pubkey: PK2, created_at: 2000 });
        await add(store, one, two);

        deepStrictEqual(ids(await store.query([{ kinds: [0] }])), [two.id, one.id]);
      });

      it('breaks created_at ties in favor of the stored event', async () => {
        const store = await openStore();
        const first = makeEvent({ id: '1'.repeat(64), kind: 0, pubkey: PK1, created_at: 1000 });
        const tie = makeEvent({ id: '2'.repeat(64), kind: 0, pubkey: PK1, created_at: 1000 });
        await add(store, first, tie);

        deepStrictEqual(await store.query([{ kinds: [0] }]), [first]);
      });

      it('removes the superseded version from the tag index', async () => {
        const store = await openStore();
        const older = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000, tags: [['t', 'old']] });
        const newer = makeEvent({ kind: 0, pubkey: PK1, created_at: 2000, tags: [['t', 'new']] });
        await add(store, older, newer);

        deepStrictEqual(await store.query([{ '#t': ['old'] }]), []);
        deepStrictEqual(await store.query([{ '#t': ['new'] }]), [newer]);
      });
    });

    describe('addressable events', () => {
      it('keeps separate d tags side by side', async () => {
        const store = await openStore();
        const one = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'one']] });
        const two = makeEvent({ kind: 30000, pubkey: PK1, created_at: 2000, tags: [['d', 'two']] });
        await add(store, one, two);

        deepStrictEqual(ids(await store.query([{ kinds: [30000] }])), [two.id, one.id]);
      });

      it('supersedes the same d tag', async () => {
        const store = await openStore();
        const older = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'list']] });
        const newer = makeEvent({ kind: 30000, pubkey: PK1, created_at: 2000, tags: [['d', 'list']] });
        await add(store, older, newer);

        deepStrictEqual(await store.query([{ kinds: [30000] }]), [newer]);
      });
    });

    describe('ephemeral events', () => {
      it('never stores them', async () => {
        const store = await openStore();
        await add(store, makeEvent({ kind: 20000 }));

        deepStrictEqual(await store.query([{}]), []);
      });
    });

    describe('duplicate events', () => {
      it('accepts the same event twice without duplicating it', async () => {
        const store = await openStore();
        const event = makeEvent({ tags: [['t', 'nostr']] });
        await add(store, event, event);

        deepStrictEqual(await store.query([{}]), [event]);
        deepStrictEqual(await store.query([{ '#t': ['nostr'] }]), [event]);
        deepStrictEqual(await store.count([{ '#t': ['nostr'] }]), { count: 1, approximate: false });
      });
    });

    describe('concurrent writes', () => {
      it('stores every event issued without awaiting', async () => {
        const store = await openStore();
        const events = Array.from({ length: 50 }, (_, i) => makeEvent({ created_at: 1000 + i }));

        await Promise.all(events.map((event) => store.event(event)));

        deepStrictEqual((await store.query([{}])).length, events.length);
      });

      it('resolves only once the event is readable', async () => {
        const store = await openStore();
        const event = makeEvent();

        await store.event(event);

        deepStrictEqual(await store.query([{ ids: [event.id] }]), [event]);
      });

      it('fails only the rejected event, not the rest of the batch', async () => {
        const store = await openStore();
        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, target, makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] }));

        const good = makeEvent({ created_at: 3000 });
        const alsoGood = makeEvent({ created_at: 4000 });

        const results = await Promise.allSettled([
          store.event(good),
          store.event(target), // already deleted
          store.event(alsoGood),
        ]);

        deepStrictEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
        deepStrictEqual(ids(await store.query([{ ids: [good.id, alsoGood.id, target.id] }])), [
          alsoGood.id,
          good.id,
        ]);
      });

      it('resolves supersession across a batch', async () => {
        const store = await openStore();
        const older = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000 });
        const newer = makeEvent({ kind: 0, pubkey: PK1, created_at: 2000 });

        await Promise.all([store.event(older), store.event(newer)]);

        deepStrictEqual(await store.query([{ kinds: [0] }]), [newer]);
      });

      it('does not let a concurrent remove disturb a write', async () => {
        const store = await openStore();
        const keep = makeEvent({ kind: 1, created_at: 1000 });
        await add(store, keep);

        const added = makeEvent({ kind: 7, created_at: 2000 });
        await Promise.all([store.event(added), store.remove([{ kinds: [1] }])]);

        deepStrictEqual(await store.query([{}]), [added]);
      });
    });

    describe('count', () => {
      it('counts matching events', async () => {
        const store = await openStore();
        await add(store, makeEvent({ kind: 1 }), makeEvent({ kind: 1 }), makeEvent({ kind: 7 }));

        deepStrictEqual(await store.count([{ kinds: [1] }]), { count: 2, approximate: false });
        deepStrictEqual(await store.count([{}]), { count: 3, approximate: false });
      });

      it('respects time bounds', async () => {
        const store = await openStore();
        await add(store, makeEvent({ created_at: 1000 }), makeEvent({ created_at: 2000 }));

        deepStrictEqual(await store.count([{ since: 2000 }]), { count: 1, approximate: false });
      });

      it('does not count an event twice across tag values', async () => {
        const store = await openStore();
        await add(store, makeEvent({ tags: [['t', 'a'], ['t', 'b']] }));

        deepStrictEqual(await store.count([{ '#t': ['a', 'b'] }]), { count: 1, approximate: false });
      });

      it('respects the limit', async () => {
        const store = await openStore();
        await add(store, makeEvent(), makeEvent(), makeEvent());

        deepStrictEqual(await store.count([{ limit: 2 }]), { count: 2, approximate: false });
      });
    });

    describe('remove', () => {
      it('removes matching events and their index rows', async () => {
        const store = await openStore();
        const note = makeEvent({ kind: 1, tags: [['t', 'nostr']] });
        const reaction = makeEvent({ kind: 7 });
        await add(store, note, reaction);

        await store.remove([{ kinds: [1] }]);

        deepStrictEqual(await store.query([{}]), [reaction]);
        deepStrictEqual(await store.query([{ '#t': ['nostr'] }]), []);
      });

      it('frees the coordinate of a replaceable event', async () => {
        const store = await openStore();
        const profile = makeEvent({ kind: 0, pubkey: PK1, created_at: 2000 });
        await add(store, profile);
        await store.remove([{ kinds: [0] }]);

        // The coordinate is free again, so an older version is now accepted.
        const older = makeEvent({ kind: 0, pubkey: PK1, created_at: 1000 });
        await add(store, older);

        deepStrictEqual(await store.query([{ kinds: [0] }]), [older]);
      });
    });

    describe('abort', () => {
      it('rejects when the signal is already aborted', async () => {
        const store = await openStore();
        await add(store, makeEvent());

        await rejects(() => store.query([{}], { signal: AbortSignal.abort() }));
      });
    });

    describe('NIP-50 search', () => {
      const note = (content: string, overrides: Partial<NostrEvent> = {}) => makeEvent({ content, ...overrides });

      it('matches case-insensitively', async () => {
        const store = await openStore();
        const event = note('Hello World');
        await add(store, event, note('goodbye'));

        deepStrictEqual(await store.query([{ search: 'hello' }]), [event]);
        deepStrictEqual(await store.query([{ search: 'WORLD' }]), [event]);
      });

      it('requires every keyword (AND)', async () => {
        const store = await openStore();
        const both = note('minimum and maximum temperature');
        await add(store, both, note('minimum only'));

        deepStrictEqual(await store.query([{ search: 'minimum maximum' }]), [both]);
      });

      it('supports quoted phrases', async () => {
        const store = await openStore();
        const phrase = note('the quick brown fox');
        await add(store, phrase, note('quick brown'));

        deepStrictEqual(await store.query([{ search: '"quick brown fox"' }]), [phrase]);
      });

      it('supports negation', async () => {
        const store = await openStore();
        const wanted = note('temperature is mild');
        await add(store, wanted, note('temperature and wind'));

        deepStrictEqual(await store.query([{ search: 'temperature -wind' }]), [wanted]);
      });

      it('ignores unsupported extension tokens', async () => {
        const store = await openStore();
        const event = note('hello');
        await add(store, event);

        deepStrictEqual(await store.query([{ search: 'hello domain:example.com' }]), [event]);
        // Extensions only: no keywords, so no constraint.
        deepStrictEqual(await store.query([{ search: 'domain:example.com' }]), [event]);
      });

      it('combines with other conditions', async () => {
        const store = await openStore();
        const wanted = note('temperature', { kind: 1 });
        await add(store, wanted, note('temperature', { kind: 7 }));

        deepStrictEqual(await store.query([{ kinds: [1], search: 'temperature' }]), [wanted]);
      });

      it('returns the newest matches under a limit', async () => {
        const store = await openStore();
        const old = note('temperature', { created_at: 1000 });
        const recent = note('temperature', { created_at: 2000 });
        await add(store, old, recent);

        deepStrictEqual(ids(await store.query([{ search: 'temperature', limit: 1 }])), [recent.id]);
      });

      it('pages across chunk boundaries', async () => {
        const store = await openStore();

        // More events than a single scan page, with runs of tied timestamps so
        // ties straddle page boundaries. Only every 7th event matches.
        const events: NostrEvent[] = [];
        for (let i = 0; i < 600; i++) {
          events.push(note(i % 7 === 0 ? 'needle' : 'haystack', { created_at: 1000 + Math.floor(i / 7) }));
        }
        await add(store, ...events);

        const expected = events.filter((e) => e.content === 'needle');
        const found = await store.query([{ search: 'needle' }]);

        deepStrictEqual(found.length, expected.length);
        deepStrictEqual(new Set(ids(found)), new Set(ids(expected)));
      });

      it('counts matches', async () => {
        const store = await openStore();
        await add(store, note('temperature'), note('temperature'), note('wind'));

        deepStrictEqual(await store.count([{ search: 'temperature' }]), { count: 2, approximate: false });
      });
    });

    describe('NIP-09 deletions', () => {
      it('deletes an event by e tag', async () => {
        const store = await openStore();
        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, target);
        await add(store, makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] }));

        deepStrictEqual(await store.query([{ ids: [target.id] }]), []);
      });

      it("does not delete another author's event", async () => {
        const store = await openStore();
        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, target);
        await add(store, makeEvent({ kind: 5, pubkey: PK2, created_at: 2000, tags: [['e', target.id]] }));

        deepStrictEqual(await store.query([{ ids: [target.id] }]), [target]);
      });

      it('retains the deletion request itself', async () => {
        const store = await openStore();
        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        const request = makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] });
        await add(store, target, request);

        deepStrictEqual(await store.query([{ kinds: [5] }]), [request]);
      });

      it('deletes an addressable event by a tag', async () => {
        const store = await openStore();
        const target = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'list']] });
        await add(store, target);
        await add(
          store,
          makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['a', `30000:${PK1}:list`]] }),
        );

        deepStrictEqual(await store.query([{ kinds: [30000] }]), []);
      });

      it('leaves a different d tag alone', async () => {
        const store = await openStore();
        const keep = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'other']] });
        await add(store, keep);
        await add(
          store,
          makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['a', `30000:${PK1}:list`]] }),
        );

        deepStrictEqual(await store.query([{ kinds: [30000] }]), [keep]);
      });

      it('does not honor an a tag the requester does not own', async () => {
        const store = await openStore();
        const target = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'list']] });
        await add(store, target);
        await add(
          store,
          makeEvent({ kind: 5, pubkey: PK2, created_at: 2000, tags: [['a', `30000:${PK1}:list`]] }),
        );

        deepStrictEqual(await store.query([{ kinds: [30000] }]), [target]);
      });

      it('lets a newer replacement survive an a tag deletion', async () => {
        const store = await openStore();
        await add(
          store,
          makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['a', `30000:${PK1}:list`]] }),
        );

        const newer = makeEvent({ kind: 30000, pubkey: PK1, created_at: 3000, tags: [['d', 'list']] });
        await add(store, newer);

        deepStrictEqual(await store.query([{ kinds: [30000] }]), [newer]);
      });

      it('refuses to re-admit a deleted event', async () => {
        const store = await openStore();
        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, target);
        await add(store, makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] }));

        await rejects(() => store.event(target), /deleted/);
        deepStrictEqual(await store.query([{ ids: [target.id] }]), []);
      });

      it('refuses to re-admit a version an a tag deletion covered', async () => {
        const store = await openStore();
        const target = makeEvent({ kind: 30000, pubkey: PK1, created_at: 1000, tags: [['d', 'list']] });
        await add(
          store,
          makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['a', `30000:${PK1}:list`]] }),
        );

        await rejects(() => store.event(target), /deleted/);
      });
    });

    describe('drivers', () => {
      it('works with better-sqlite3', async () => {
        const { default: BetterSQLite3 } = await import('better-sqlite3');
        const sqlite = new BetterSQLite3(':memory:');

        const store = new Store({
          run: (sql, params = []) => void sqlite.prepare(sql).run(...params as NSQLiteValue[]),
          all: (sql, params = []) => sqlite.prepare(sql).all(...params as NSQLiteValue[]) as NSQLiteRow[],
          close: () => sqlite.close(),
        });

        try {
          await store.migrate();

          const note = makeEvent({ kind: 1, created_at: 2000, tags: [['t', 'nostr']] });
          const reaction = makeEvent({ kind: 7, created_at: 1000 });
          await add(store, note, reaction);

          deepStrictEqual(ids(await store.query([{}])), [note.id, reaction.id]);
          deepStrictEqual(await store.query([{ '#t': ['nostr'] }]), [note]);
          deepStrictEqual(await store.count([{ kinds: [1] }]), { count: 1, approximate: false });
        } finally {
          await store.close();
        }
      });

      it('rolls back a failed write', async () => {
        const sqlite = new DatabaseSync(':memory:');
        const store = new Store(nodeSQLite(sqlite));
        openStores.push(store);
        await store.migrate();

        const target = makeEvent({ pubkey: PK1, created_at: 1000 });
        await add(store, target, makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] }));

        await rejects(() => store.event(target));

        // The rejected write left no transaction open, so the store still works.
        const next = makeEvent({ created_at: 3000 });
        await add(store, next);
        ok((await store.query([{ ids: [next.id] }])).length === 1);
      });
    });
  });
}

// NSQLite answers NIP-50 `search` from an FTS5 index, so its matching differs
// from NSQLiteJoin's substring scan. These pin down that behavior.
await describe('NSQLite full-text search', () => {
  const openFts = async (): Promise<NSQLite> => {
    const store = new NSQLite(nodeSQLite(new DatabaseSync(':memory:')));
    openStores.push(store);
    await store.migrate();
    return store;
  };

  const note = (content: string, overrides: Partial<NostrEvent> = {}) => makeEvent({ content, ...overrides });

  it('matches whole words, not substrings', async () => {
    const store = await openFts();
    const word = note('hello nostr world');
    await add(store, word, note('hello nostrich world'));

    deepStrictEqual(await store.query([{ search: 'nostr' }]), [word]);
  });

  it('ignores case and diacritics', async () => {
    const store = await openFts();
    const event = note("Un CAFÉ, s'il vous plaît");
    await add(store, event);

    deepStrictEqual(await store.query([{ search: 'cafe' }]), [event]);
    deepStrictEqual(await store.query([{ search: 'CAFÉ' }]), [event]);
  });

  it('treats FTS5 operators in a search as literal words', async () => {
    const store = await openFts();
    const event = note('this AND that OR the other');
    await add(store, event, note('nothing to see'));

    // Read as syntax these would be malformed queries or mean something else.
    deepStrictEqual(await store.query([{ search: 'AND' }]), [event]);
    deepStrictEqual(await store.query([{ search: '"OR the"' }]), [event]);
    deepStrictEqual(await store.query([{ search: 'NEAR' }]), []);
  });

  it('does not break on punctuation-only or empty searches', async () => {
    const store = await openFts();
    const event = note('hello');
    await add(store, event);

    deepStrictEqual(await store.query([{ search: '' }]), [event]);
    deepStrictEqual(await store.query([{ search: '!!!' }]), []);
    deepStrictEqual(await store.query([{ search: '(((' }]), []);
  });

  it('supports a search that is only negations', async () => {
    const store = await openFts();
    const kept = note('sunshine');
    await add(store, kept, note('rain'));

    // FTS5 can't express this, so it falls back to matching in memory.
    deepStrictEqual(await store.query([{ search: '-rain' }]), [kept]);
  });

  it('applies a common keyword by filtering the scan', async () => {
    const store = await openFts();

    // More matches than are worth driving the query with, so the planner
    // filters an indexed scan instead of leading with the index.
    const events: NostrEvent[] = [];
    for (let i = 0; i < 1200; i++) {
      events.push(note(`common word number ${i}`, { created_at: 1000 + i }));
    }
    events.push(note('a distinctive phrase', { created_at: 9000 }));
    await add(store, ...events);

    deepStrictEqual((await store.query([{ search: 'common', limit: 20 }])).length, 20);
    deepStrictEqual((await store.query([{ search: 'common' }])).length, 1200);
    deepStrictEqual((await store.query([{ search: 'distinctive' }])).length, 1);
  });

  it('keeps the index in step when events are removed', async () => {
    const store = await openFts();
    const event = note('findable');
    await add(store, event);
    deepStrictEqual(await store.query([{ search: 'findable' }]), [event]);

    await store.remove([{ ids: [event.id] }]);

    deepStrictEqual(await store.query([{ search: 'findable' }]), []);
  });

  it('keeps the index in step when a replaceable event is superseded', async () => {
    const store = await openFts();
    await add(store, makeEvent({ kind: 0, pubkey: PK1, created_at: 1000, content: 'oldbio' }));
    await add(store, makeEvent({ kind: 0, pubkey: PK1, created_at: 2000, content: 'newbio' }));

    deepStrictEqual(await store.query([{ search: 'oldbio' }]), []);
    deepStrictEqual((await store.query([{ search: 'newbio' }])).length, 1);
  });

  it('keeps the index in step when a deletion request removes an event', async () => {
    const store = await openFts();
    const target = makeEvent({ pubkey: PK1, created_at: 1000, content: 'deleteme' });
    await add(store, target);
    await add(store, makeEvent({ kind: 5, pubkey: PK1, created_at: 2000, tags: [['e', target.id]] }));

    deepStrictEqual(await store.query([{ search: 'deleteme' }]), []);
  });

  it('combines search with tags, authors and kinds', async () => {
    const store = await openFts();
    const wanted = note('weather report', { kind: 1, pubkey: PK1, tags: [['t', 'oslo']] });
    await add(
      store,
      wanted,
      note('weather report', { kind: 1, pubkey: PK2, tags: [['t', 'oslo']] }),
      note('weather report', { kind: 7, pubkey: PK1, tags: [['t', 'oslo']] }),
      note('traffic report', { kind: 1, pubkey: PK1, tags: [['t', 'oslo']] }),
    );

    deepStrictEqual(await store.query([{ search: 'weather', kinds: [1], authors: [PK1] }]), [wanted]);
    deepStrictEqual(await store.query([{ search: 'weather', '#t': ['oslo'], authors: [PK1], kinds: [1] }]), [wanted]);
  });
});

await describe('NSQLite full-text search with a common keyword', () => {
  it('still applies keywords on a tag-driven scan', async () => {
    const store = new NSQLite(nodeSQLite(new DatabaseSync(':memory:')));
    openStores.push(store);
    await store.migrate();

    // Enough matches that the keyword filters the scan rather than driving it,
    // which a tag-driven scan can't express in SQL.
    const events: NostrEvent[] = [];
    for (let i = 0; i < 1200; i++) {
      events.push(makeEvent({ content: `common word ${i}`, tags: [['t', 'x']], created_at: 1000 + i }));
    }
    events.push(makeEvent({ content: 'nothing here', tags: [['t', 'x']], created_at: 9000 }));
    await add(store, ...events);

    // The newest #t event has no keyword, so a scan that skipped the keyword
    // check would return it.
    const found = await store.query([{ search: 'common', '#t': ['x'], limit: 5 }]);

    deepStrictEqual(found.length, 5);
    ok(found.every((event) => event.content.includes('common')));
  });
});

await describe('NSQLiteFTS token encoding', () => {
  const openStore = async (): Promise<NSQLiteFTS> => {
    const store = new NSQLiteFTS(nodeSQLite(new DatabaseSync(':memory:')));
    openStores.push(store);
    await store.migrate();
    return store;
  };

  /** Tag values that don't survive a tokenizer unescaped, and must still match exactly. */
  const awkward = [
    'Uppercase',
    'MiXeD-CaSe',
    'with spaces',
    'punctuation!?',
    'a:b:c',
    'under_score',
    'naïve',
    '🔥',
    '30023:aaaa:my-article',
    'https://example.com/path?x=1',
    '',
  ];

  for (const value of awkward) {
    it(`round-trips a tag value: ${JSON.stringify(value)}`, async () => {
      // The default policy skips empty values and long ones, so index everything.
      const store = new NSQLiteFTS(nodeSQLite(new DatabaseSync(':memory:')), {
        indexTags: (event) => event.tags,
      });
      openStores.push(store);
      await store.migrate();

      const wanted = makeEvent({ tags: [['t', value]] });
      // A value the wanted one is a prefix of, which a tokenizer that split or
      // truncated the token would confuse it with.
      const other = makeEvent({ tags: [['t', `${value}x`]] });
      await add(store, wanted, other);

      deepStrictEqual(ids(await store.query([{ '#t': [value] }])), [wanted.id]);
    });
  }

  it('does not confuse a value with the escaped form of another', async () => {
    const store = await openStore();
    // 'x' escapes to `_78`, so a literal value of `_78` must not collide.
    const escaped = makeEvent({ tags: [['t', 'X']] });
    const literal = makeEvent({ tags: [['t', '_58']] });
    await add(store, escaped, literal);

    deepStrictEqual(ids(await store.query([{ '#t': ['X'] }])), [escaped.id]);
    deepStrictEqual(ids(await store.query([{ '#t': ['_58'] }])), [literal.id]);
  });

  it('does not confuse a tag name with another name and value', async () => {
    const store = await openStore();
    const a = makeEvent({ tags: [['e', 'ab']] });
    const b = makeEvent({ tags: [['e', 'b']] });
    await add(store, a, b);

    deepStrictEqual(ids(await store.query([{ '#e': ['ab'] }])), [a.id]);
    deepStrictEqual(ids(await store.query([{ '#e': ['b'] }])), [b.id]);
  });

  it('does not match a tag filter against words in the content', async () => {
    const store = await openStore();
    const id = '1'.repeat(64);
    // The token for this filter is `e:1111…`, which this event's text contains.
    await add(store, makeEvent({ content: `see e:${id} and p:${'a'.repeat(64)}` }));

    deepStrictEqual(await store.query([{ '#e': [id] }]), []);
    deepStrictEqual(await store.query([{ '#p': ['a'.repeat(64)] }]), []);
  });

  it('does not match a tag filter against a reserved token', async () => {
    const store = await openStore();
    const event = makeEvent({ kind: 7, pubkey: PK1 });
    await add(store, event);

    // `_p:<pubkey>` is how the author is indexed; a tag named `_p` must not
    // reach it, and neither must a tag whose name escapes near it.
    deepStrictEqual(await store.query([{ '#_p': [PK1] }]), []);
    deepStrictEqual(await store.query([{ '#_d': [event.id] }]), []);
  });

  it('orders events sharing a timestamp, and pages through them', async () => {
    const store = await openStore();
    const events = Array.from({ length: 50 }, () => makeEvent({ created_at: 1000, tags: [['t', 'x']] }));
    await add(store, ...events);

    const found = await store.query([{ '#t': ['x'] }]);
    deepStrictEqual(found.length, 50);
    // Ties break on id, ascending.
    deepStrictEqual(ids(found), ids([...events].sort((a, b) => (a.id < b.id ? -1 : 1))));
  });

  it('keeps ordering when events arrive out of order', async () => {
    const store = await openStore();
    const newest = makeEvent({ created_at: 3000, tags: [['t', 'x']] });
    const oldest = makeEvent({ created_at: 1000, tags: [['t', 'x']] });
    const middle = makeEvent({ created_at: 2000, tags: [['t', 'x']] });
    // Written newest-first, so the older two land behind the newest rowid.
    await add(store, newest, oldest, middle);

    deepStrictEqual(ids(await store.query([{ '#t': ['x'] }])), [newest.id, middle.id, oldest.id]);
    deepStrictEqual(ids(await store.query([{ '#t': ['x'], limit: 2 }])), [newest.id, middle.id]);
    deepStrictEqual(ids(await store.query([{ '#t': ['x'], since: 1500, until: 2500 }])), [middle.id]);
  });

  it('fills a limit even when most matches are filtered out', async () => {
    const store = await openStore();
    // 300 events on the tag, only every tenth of the wanted kind, so the scan
    // has to page well past its first read to find twenty.
    const events: NostrEvent[] = [];
    for (let i = 0; i < 300; i++) {
      events.push(makeEvent({ kind: i % 10 === 0 ? 1 : 7, created_at: 1000 + i, tags: [['t', 'x']] }));
    }
    await add(store, ...events);

    const found = await store.query([{ '#t': ['x'], kinds: [1], limit: 20 }]);

    deepStrictEqual(found.length, 20);
    ok(found.every((event) => event.kind === 1));
    // Newest-first: the last kind 1 written is the first returned.
    deepStrictEqual(found[0].created_at, 1290);
  });

  it('counts a filter whose conditions are not all in the index', async () => {
    const store = await openStore();
    await add(
      store,
      makeEvent({ kind: 1, tags: [['t', 'x']] }),
      makeEvent({ kind: 7, tags: [['t', 'x']] }),
      makeEvent({ kind: 1, tags: [['t', 'y']] }),
    );

    deepStrictEqual(await store.count([{ '#t': ['x'] }]), { count: 2, approximate: false });
    deepStrictEqual(await store.count([{ '#t': ['x'], kinds: [1] }]), { count: 1, approximate: false });
  });

  it('handles a timestamp beyond the rowid encoding', async () => {
    const store = await openStore();
    const huge = makeEvent({ created_at: 2 ** 40, tags: [['t', 'x']] });
    const normal = makeEvent({ created_at: 1000, tags: [['t', 'x']] });
    await add(store, huge, normal);

    deepStrictEqual(ids(await store.query([{ '#t': ['x'] }])), [huge.id, normal.id]);
    deepStrictEqual(ids(await store.query([{ '#t': ['x'], since: 2 ** 39 }])), [huge.id]);
    deepStrictEqual(ids(await store.query([{ '#t': ['x'], until: 2 ** 39 }])), [normal.id]);
  });
});
