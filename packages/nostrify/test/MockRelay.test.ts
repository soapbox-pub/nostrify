import { assertEquals } from '@std/assert';

import { MockRelay } from './MockRelay.ts';

import event1 from '../../../fixtures/event-1.json' with { type: 'json' };

Deno.test('MockRelay', async () => {
  const relay = new MockRelay();

  assertEquals(await relay.count([{ ids: [event1.id] }]), { count: 0, approximate: false });

  await relay.event(event1);

  assertEquals(await relay.count([{ ids: [event1.id] }]), { count: 1, approximate: false });

  const result = await relay.query([{ ids: [event1.id] }]);
  assertEquals(result[0], event1);
});
