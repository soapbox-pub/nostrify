import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { AuthorPolicy } from './AuthorPolicy.ts';

Deno.test('AuthorPolicy', async () => {
  const store = new MockRelay();
  const policy = new AuthorPolicy(store);

  const sk = generateSecretKey();
  const event = genEvent({ kind: 1 }, sk);

  const [, , ok1] = await policy.call(event);

  assertEquals(ok1, false);

  await store.event(genEvent({ kind: 0 }, sk));

  const [, , ok2] = await policy.call(event);

  assertEquals(ok2, true);
});
