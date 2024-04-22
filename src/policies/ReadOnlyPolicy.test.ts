import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { ReadOnlyPolicy } from './ReadOnlyPolicy.ts';

Deno.test('ReadOnlyPolicy', async () => {
  const policy = new ReadOnlyPolicy();

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, eventId, ok, reason] = await policy.call(event);

  assertEquals(eventId, event.id);
  assertEquals(reason, 'blocked: the relay is read-only');
  assertEquals(ok, false);
});
