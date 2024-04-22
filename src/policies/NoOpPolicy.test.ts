import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NoOpPolicy } from './NoOpPolicy.ts';

Deno.test('NoOpPolicy', async () => {
  const policy = new NoOpPolicy();

  const event = finalizeEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  const [_, eventId, ok] = await policy.call(event);

  assertEquals(eventId, event.id);
  assertEquals(ok, true);
});
