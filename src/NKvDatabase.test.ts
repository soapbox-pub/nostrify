import { assertEquals, assertRejects } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { NKvDatabase } from './NKvDatabase.ts';
import { LmdbKeys } from './NKvDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };
import PR_EVENTS from '../fixtures/parameterized-replaceable-events.json' with { type: 'json' };

const samplePubkey = 'c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c';
const sampleKind = 1985;
const sampleTimestamp = 1691091734;

Deno.test("Tests for LmdbKeys", async (t) => {
  await t.step("byPubkey and from('pubkey')", () => {
    const key = LmdbKeys.byPubkey(sampleTimestamp, samplePubkey);
    const { timestamp, pubkey } = LmdbKeys.from('pubkey', key);
    assertEquals(timestamp, sampleTimestamp);
    assertEquals(samplePubkey, pubkey);
  });

  await t.step("byPubkeyAndKind and from('pubkey-kind')", () => {
    const key = LmdbKeys.byPubkeyAndKind(sampleTimestamp, samplePubkey, sampleKind);
    const { timestamp, pubkey, kind } = LmdbKeys.from('pubkey-kind', key);
    assertEquals(timestamp, sampleTimestamp);
    assertEquals(samplePubkey, pubkey);
    assertEquals(sampleKind, kind);
  });

  await t.step("byKind and from('kind')", () => {
    const key = LmdbKeys.byKind(sampleTimestamp, sampleKind);
    const { timestamp, kind } = LmdbKeys.from('kind', key);
    assertEquals(timestamp, sampleTimestamp);
    assertEquals(kind, sampleKind);
  });

  await t.step("byTimestamp and from('timestamp')", () => {
    const key = LmdbKeys.byTimestamp(sampleTimestamp);
    const { timestamp } = LmdbKeys.from('timestamp', key);
    assertEquals(timestamp, sampleTimestamp);
  });
});

/** Create in-memory database for testing. */
const createDB = async () => {
  try {
    await Deno.remove('./testing.lmdb');
  } catch (_) { /* don't care */ }
  try {
    await Deno.remove('./testing.lmdb-lock');
  } catch (_) { /* don't care */ }
  const db = new NKvDatabase('./testing.lmdb');
  return db;
};

Deno.test('NKvDatabase.count', async () => {
  const db = await createDB();
  assertEquals((await db.count([{ kinds: [1] }])).count, 0);
  await db.event(event1);
  assertEquals((await db.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NKvDatabase.query', async (t) => {
  const db = await createDB();
  await db.event(event1);

  await t.step('should find by kind', async () => {
    assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  });

  await t.step('should not find nonexistent by kind', async () => {
    assertEquals(await db.query([{ kinds: [3] }]), []);
  });

  await t.step('should find by since', async () => {
    assertEquals(await db.query([{ since: 1691091363 }]), [event1]);
  });

  await t.step('should not find by until if not exists', async () => {
    assertEquals(await db.query([{ until: 1691091364 }]), []);
  });

  await t.step('should find by tag', async () => {
    assertEquals(
      await db.query([{ '#t': ['t for testing'] }]),
      [event1],
    );
  });
});

Deno.test("NKvDatabase.query with multiple tags doesn't crash", async () => {
  const db = await createDB();

  await db.query([{
    kinds: [1985],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
    '#L': ['nip05'],
    '#l': ['alex@gleasonator.com'],
  }]);
});

Deno.test('NKvDatabase.remove', async () => {
  const db = await createDB();
  await db.event(event1);
  assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  await db.remove([{ kinds: [1] }]);
  assertEquals(await db.query([{ kinds: [1] }]), []);
});

Deno.test('NKvDatabase.event with a deleted event', async () => {
  const db = await createDB();

  await db.event(event1);

  assertEquals(await db.query([{ kinds: [1] }]), [event1]);

  await db.event({
    kind: 5,
    pubkey: event1.pubkey,
    tags: [['e', event1.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [1] }]), []);

  await assertRejects(() => db.event(event1));

  assertEquals(await db.query([{ kinds: [1] }]), []);
});

Deno.test('NKvDatabase.event with replaceable event', async () => {
  const db = await createDB();
  assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 0);

  await db.event(event0);
  await assertRejects(() => db.event(event0));
  assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 1);

  const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
  await db.event(changeEvent);
  assertEquals(await db.query([{ kinds: [0] }]), [changeEvent]);
});

Deno.test('NKvDatabase.event with parameterized replaceable event', async (t) => {
  const db = await createDB();

  const [event0, event1, event2] = PR_EVENTS;

  await t.step('should insert replaceable event', async () => {
    await db.event(event0);
    assertEquals(await db.query([{ ids: [event0.id] }]), [event0]);
  })

  await t.step('should delete old event when inserting new event', async () => {
    await db.event(event1);
    assertEquals(await db.query([{ ids: [event0.id] }]), []);
  })

  await t.step('new event should be inserted correctly', async () => {
    assertEquals(await db.query([{ ids: [event1.id] }]), [event1]);
  })

  await t.step('repeat with a third event', async () => {
    await db.event(event2);
    assertEquals(await db.query([{ ids: [event0.id, event1.id] }]), []);
    assertEquals(await db.query([{ ids: [event2.id] }]), [event2]);
  })
});
