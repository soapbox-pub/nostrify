import { assertEquals, assertRejects } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { NKvDatabase } from './NKvDatabase.ts';
import { LmdbKeys } from './NKvDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };

const samplePubkey = 'c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c';
const sampleKind = 1985;
const sampleTimestamp = 1691091734;

Deno.test("LmdbKeys.byPubkey and LmdbKeys.from('pubkey', ...)", () => {
    const key = LmdbKeys.byPubkey(sampleTimestamp, samplePubkey);
    const { timestamp, pubkey } = LmdbKeys.from('pubkey', key);
    assertEquals(timestamp, sampleTimestamp);
    assertEquals(samplePubkey, pubkey);
})

Deno.test("LmdbKeys.byPubkeyAndKind and LmdbKeys.from('pubkey-kind', ...)", () => {
    const key = LmdbKeys.byPubkeyAndKind(sampleTimestamp, samplePubkey, sampleKind);
    const { timestamp, pubkey, kind } = LmdbKeys.from('pubkey-kind', key);

    assertEquals(timestamp, sampleTimestamp);
    assertEquals(samplePubkey, pubkey);
    assertEquals(sampleKind, kind);
})

Deno.test("LmdbKeys.byKind and LmdbKeys.from('kind', ...)", () => {
    const key = LmdbKeys.byKind(sampleTimestamp, sampleKind);
    const { timestamp, kind } = LmdbKeys.from('kind', key);

    assertEquals(timestamp, sampleTimestamp);
    assertEquals(kind, sampleKind);
})

Deno.test("LmdbKeys.byTimestamp and LmdbKeys.from('timestamp', ...)", () => {
    const key = LmdbKeys.byTimestamp(sampleTimestamp);
    const { timestamp } = LmdbKeys.from('kind', key);

    assertEquals(timestamp, sampleTimestamp);
})

/** Create in-memory database for testing. */
const createDB = async () => {
    try {
        await Deno.remove('./testing.lmdb');
    }
    catch (e) {
        console.error(e);
    }
    const db = new NKvDatabase('./testing.lmdb');
    return db;
};

Deno.test('NKvDatabase.count', async () => {
    const db = await createDB();
    assertEquals((await db.count([{ kinds: [1] }])).count, 0);
    await db.event(event1);
    assertEquals((await db.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NKvDatabase.query', async () => {
    const db = await createDB();
    await db.event(event1);
    assertEquals(await db.query([{ kinds: [1] }]), [event1]);
    assertEquals(await db.query([{ kinds: [3] }]), []);
    assertEquals(await db.query([{ since: 1691091000 }]), [event1]);
    assertEquals(await db.query([{ until: 1691091000 }]), []);
    assertEquals(
        await db.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
        [event1],
    );
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

Deno.test('NKvDatabase.event with parameterized replaceable event', async () => {
    const db = await createDB();

    const event0 = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
    const event1 = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [['d', 'a']] };
    const event2 = { id: '3', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

    await db.event(event0);
    assertEquals(await db.query([{ ids: [event0.id] }]), [event0]);

    await db.event(event1);
    assertEquals(await db.query([{ ids: [event0.id] }]), []);
    assertEquals(await db.query([{ ids: [event1.id] }]), [event1]);

    await db.event(event2);
    assertEquals(await db.query([{ ids: [event0.id] }]), []);
    assertEquals(await db.query([{ ids: [event1.id] }]), []);
    assertEquals(await db.query([{ ids: [event2.id] }]), [event2]);
});
