import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import type { NostrEvent } from '@nostrify/types';

import { EventCollector } from './EventCollector.ts';
import { NSet } from '../NSet.ts';

function evt(props: Partial<NostrEvent> & { id: string }): NostrEvent {
  return {
    kind: 1,
    pubkey: 'abc',
    content: '',
    created_at: 0,
    sig: '',
    tags: [],
    ...props,
  };
}

/** Feed the same events through `NSet` for comparison. */
function viaNSet(events: NostrEvent[]): NostrEvent[] {
  const set = new NSet();
  for (const event of events) set.add(event);
  return [...set];
}

await test('EventCollector dedupes by id', () => {
  const collector = new EventCollector();
  const event = evt({ id: '1' });

  collector.add(event);
  collector.add(event);

  deepStrictEqual(collector.size, 1);
  deepStrictEqual(collector.toArray(), [event]);
});

await test('EventCollector keeps only the newest replaceable event', () => {
  const event0 = evt({ id: '1', kind: 0, created_at: 0 });
  const event1 = evt({ id: '2', kind: 0, created_at: 1 });
  const event2 = evt({ id: '3', kind: 0, created_at: 2 });

  const collector = new EventCollector();
  collector.add(event0);
  collector.add(event1);
  collector.add(event2);

  deepStrictEqual(collector.size, 1);
  deepStrictEqual(collector.toArray(), [event2]);
});

await test('EventCollector ignores an older replaceable event', () => {
  const newer = evt({ id: '1', kind: 0, created_at: 5 });
  const older = evt({ id: '2', kind: 0, created_at: 1 });

  const collector = new EventCollector();
  collector.add(newer);
  collector.add(older);

  deepStrictEqual(collector.toArray(), [newer]);
});

await test('EventCollector keeps only the newest addressable event per d tag', () => {
  const a0 = evt({ id: '1', kind: 30000, created_at: 0, tags: [['d', 'a']] });
  const a1 = evt({ id: '2', kind: 30000, created_at: 1, tags: [['d', 'a']] });
  const b0 = evt({ id: '3', kind: 30000, created_at: 0, tags: [['d', 'b']] });

  const collector = new EventCollector();
  collector.add(a0);
  collector.add(a1);
  collector.add(b0);

  deepStrictEqual(collector.size, 2);
  deepStrictEqual(collector.toArray().map((e) => e.id).sort(), ['2', '3']);
});

await test('EventCollector separates coordinates by pubkey', () => {
  const a = evt({ id: '1', kind: 0, pubkey: 'aaa', created_at: 5 });
  const b = evt({ id: '2', kind: 0, pubkey: 'bbb', created_at: 1 });

  const collector = new EventCollector();
  collector.add(a);
  collector.add(b);

  deepStrictEqual(collector.size, 2);
});

await test('EventCollector applies a deletion arriving after its target', () => {
  const target = evt({ id: '1', kind: 0 });
  const deletion = evt({ id: '2', kind: 5, tags: [['e', '1']] });

  const collector = new EventCollector();
  collector.add(target);
  collector.add(deletion);

  deepStrictEqual(collector.toArray(), [deletion]);
});

await test('EventCollector rejects an event already deleted by a kind 5', () => {
  const deletion = evt({ id: '2', kind: 5, tags: [['e', '1']] });
  const target = evt({ id: '1', kind: 0 });

  const collector = new EventCollector();
  collector.add(deletion);
  collector.add(target);
  // Re-adding must stay rejected.
  collector.add(target);

  deepStrictEqual(collector.toArray(), [deletion]);
});

await test('EventCollector ignores a deletion from a different pubkey', () => {
  const target = evt({ id: '1', kind: 0, pubkey: 'aaa' });
  const deletion = evt({ id: '2', kind: 5, pubkey: 'bbb', tags: [['e', '1']] });

  const collector = new EventCollector();
  collector.add(target);
  collector.add(deletion);

  deepStrictEqual(collector.size, 2);
});

await test('EventCollector frees the coordinate when the winner is deleted', () => {
  const newer = evt({ id: '1', kind: 0, created_at: 5 });
  const deletion = evt({ id: '2', kind: 5, created_at: 6, tags: [['e', '1']] });
  const older = evt({ id: '3', kind: 0, created_at: 1 });

  const collector = new EventCollector();
  collector.add(newer);
  collector.add(deletion);
  collector.add(older);

  // The older event is accepted, because the newer one is no longer present.
  deepStrictEqual(collector.toArray().map((e) => e.id).sort(), ['2', '3']);
  deepStrictEqual(viaNSet([newer, deletion, older]).map((e) => e.id).sort(), ['2', '3']);
});

await test('EventCollector sorts newest first, breaking ties by id', () => {
  const a = evt({ id: 'b', created_at: 1 });
  const b = evt({ id: 'a', created_at: 1 });
  const c = evt({ id: 'c', created_at: 9 });

  const collector = new EventCollector();
  collector.add(a);
  collector.add(b);
  collector.add(c);

  deepStrictEqual(collector.toArray().map((e) => e.id), ['c', 'a', 'b']);
});

await test('EventCollector preserves receive order separately from sort order', () => {
  const a = evt({ id: 'a', created_at: 1 });
  const b = evt({ id: 'b', created_at: 9 });

  const collector = new EventCollector();
  collector.add(a);
  collector.add(b);

  deepStrictEqual(collector.toReceivedArray().map((e) => e.id), ['a', 'b']);
  deepStrictEqual(collector.toArray().map((e) => e.id), ['b', 'a']);
});

await test('EventCollector does not let a rejected event destroy the event it would have replaced', () => {
  const older = evt({ id: '1', kind: 0, pubkey: 'bbb', created_at: 3 });
  const deletion = evt({ id: '2', kind: 5, pubkey: 'bbb', created_at: 1, tags: [['e', '3']] });
  const newer = evt({ id: '3', kind: 0, pubkey: 'bbb', created_at: 4 });

  const collector = new EventCollector();
  collector.add(older);
  collector.add(deletion);
  collector.add(newer);

  // `newer` is rejected, because `deletion` deletes it. `older` must survive: an event
  // that was never accepted shouldn't be able to replace anything.
  deepStrictEqual(collector.toArray().map((e) => e.id), ['1', '2']);

  // `NSet` drops `older` here. Its scan runs in sorted order and deletes `older` as
  // "replaced by `newer`" before it reaches `deletion` and rejects `newer`, so the set
  // loses both. Whether that happens at all depends on `created_at` ordering.
  deepStrictEqual(viaNSet([older, deletion, newer]).map((e) => e.id), ['2']);
});

await test('EventCollector matches NSet on randomized event streams', () => {
  // Deterministic PRNG so failures are reproducible.
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  const kinds = [0, 1, 3, 5, 10002, 30023];
  const pubkeys = ['aaa', 'bbb'];
  const dTags = ['x', 'y'];

  for (let round = 0; round < 300; round++) {
    const events: NostrEvent[] = [];

    for (let i = 0; i < 12; i++) {
      const kind = kinds[rand(kinds.length)];
      const tags: string[][] = [];

      if (kind === 5) {
        // Delete an id that may or may not exist in this stream.
        tags.push(['e', String(rand(12))]);
      } else if (kind === 30023) {
        tags.push(['d', dTags[rand(dTags.length)]]);
      }

      events.push(evt({
        id: String(i),
        kind,
        pubkey: pubkeys[rand(pubkeys.length)],
        created_at: rand(4),
        tags,
      }));
    }

    const collector = new EventCollector();
    for (const event of events) collector.add(event);

    const actual = collector.toArray();
    const expected = viaNSet(events);
    const message = `round ${round} diverged for: ${JSON.stringify(events)}`;

    if (events.some((event) => event.kind === 5)) {
      // With deletions in play the two can differ, but only because `NSet` also drops
      // events that a rejected event would have replaced. So `NSet`'s result is always
      // a subset of ours, never the other way around.
      const ids = new Set(actual.map((e) => e.id));
      deepStrictEqual(expected.filter((e) => !ids.has(e.id)), [], message);
    } else {
      deepStrictEqual(actual, expected, message);
    }
  }
});
