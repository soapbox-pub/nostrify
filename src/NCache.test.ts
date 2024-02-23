import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

import { NCache } from './NCache.ts';

import event1 from '../fixtures/event-1.json' with { type: 'json' };

Deno.test('NCache', async () => {
  const cache = new NCache({
    max: 3000,
    maxEntrySize: 5000,
    sizeCalculation: (event) => JSON.stringify(event).length,
  });

  assertEquals(await cache.count([{ ids: [event1.id] }]), { count: 0, approximate: false });

  await cache.event(event1);

  assertEquals(await cache.count([{ ids: [event1.id] }]), { count: 1, approximate: false });

  const result = await cache.query([{ ids: [event1.id] }]);
  assertEquals(result[0], event1);
});
