import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NoOpPolicy } from './NoOpPolicy.ts';

Deno.test('NoOpPolicy', async () => {
  const policy = new NoOpPolicy();

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, eventId, ok] = await policy.call(event);

  assertEquals(eventId, event.id);
  assertEquals(ok, true);
});
