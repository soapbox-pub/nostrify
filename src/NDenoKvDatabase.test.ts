import { assertEquals, assertRejects } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { NDenoKvDatabase } from './NDenoKvDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };
import PR_EVENTS from '../fixtures/parameterized-replaceable-events.json' with { type: 'json' };

/** Create in-memory database for testing. */
const withDb = async (fn: (db: NDenoKvDatabase) => Promise<void>) => {
  const kv = await Deno.openKv(':memory:');
  const db = new NDenoKvDatabase(kv);
  await fn(db);
  db.close();
};

Deno.test('NKvDatabase.count', async (t) => {
  await withDb(async (db) => {
    await t.step('make sure no events exist', async () => {
      assertEquals((await db.count([{ kinds: [1] }])).count, 0);
    });

    await db.event(event1);

    await t.step('make sure one event exists after inserting', async () => {
      assertEquals((await db.count([{ kinds: [1] }])).count, 1);
    });
  });
});

Deno.test('NKvDatabase.query', async (t) => {
  await withDb(async (db) => {
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
});

Deno.test("NKvDatabase.query with multiple tags doesn't crash", async () => {
  await withDb(async (db) => {
    await db.query([{
      kinds: [1985],
      authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
      '#L': ['nip05'],
      '#l': ['alex@gleasonator.com'],
    }]);
  });
});

Deno.test('NKvDatabase.remove', async () => {
  await withDb(async (db) => {
    await db.event(event1);
    assertEquals(await db.query([{ kinds: [1] }]), [event1]);
    await db.remove([{ kinds: [1] }]);
    assertEquals(await db.query([{ kinds: [1] }]), []);
  });
});

Deno.test('NKvDatabase.event with a deleted event', async (t) => {
  await withDb(async (db) => {
    await db.event(event1);
    assertEquals(await db.query([{ kinds: [1] }]), [event1]);

    await t.step('ensure kind 5 events delete old events', async () => {
      await db.event({
        kind: 5,
        pubkey: event1.pubkey,
        tags: [['e', event1.id]],
        created_at: 0,
        content: '',
        id: 'foobar',
        sig: 'sig',
      });

      assertEquals(await db.query([{ kinds: [1] }]), []);
    });

    await t.step('ensure deletions are permanent and respected in future', async () => {
      await assertRejects(() => db.event(event1));
      assertEquals(await db.query([{ kinds: [1] }]), []);
    });
  });
});

Deno.test('NKvDatabase.event with replaceable event', async (t) => {
  await withDb(async (db) => {
    await t.step('ensure no kind 0 events exist', async () => {
      assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 0);
    });

    await t.step('put kind 0 event and ensure putting it again fails', async () => {
      await db.event(event0);
      await assertRejects(() => db.event(event0));
    });

    await t.step('ensure only 1 kind 0 event exists', async () => {
      assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 1);
    });

    await t.step('ensure that replacing puts only one db in event', async () => {
      const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
      await db.event(changeEvent);
      assertEquals(await db.query([{ kinds: [0] }]), [changeEvent]);
    });
  });
});

Deno.test('NKvDatabase.event with parameterized replaceable event', async (t) => {
  await withDb(async (db) => {
    const [event0, event1, event2] = PR_EVENTS;

    await t.step('should insert replaceable event', async () => {
      await db.event(event0);
      assertEquals(await db.query([{ ids: [event0.id] }]), [event0]);
    });

    await t.step('should delete old event when inserting new event', async () => {
      await db.event(event1);
      assertEquals(await db.query([{ ids: [event0.id] }]), []);
    });

    await t.step('new event should be inserted correctly', async () => {
      assertEquals(await db.query([{ ids: [event1.id] }]), [event1]);
    });

    await t.step('repeat with a third event', async () => {
      await db.event(event2);
      assertEquals(await db.query([{ ids: [event0.id, event1.id] }]), []);
      assertEquals(await db.query([{ ids: [event2.id] }]), [event2]);
    });
  });
});
