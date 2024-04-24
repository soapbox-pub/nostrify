import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { FiltersPolicy } from './FiltersPolicy.ts';

Deno.test('FiltersPolicy', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await new FiltersPolicy([{ kinds: [1] }]).call(event))[2], true);
  assertEquals((await new FiltersPolicy([{ kinds: [1], authors: [] }]).call(event))[2], false);
});
