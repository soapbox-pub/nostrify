import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { SizePolicy } from './SizePolicy.ts';

Deno.test('SizePolicy', async () => {
  const policy = new SizePolicy();

  const event = finalizeEvent(
    { kind: 1, content: 'yolo'.repeat(100), tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const bigEvent = finalizeEvent(
    { kind: 1, content: 'yolo'.repeat(2500), tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await policy.call(event))[2], true);
  assertEquals((await policy.call(bigEvent))[2], false);
});
