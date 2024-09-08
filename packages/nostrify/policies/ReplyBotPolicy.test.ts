import { assertEquals } from '@std/assert';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { ReplyBotPolicy } from './ReplyBotPolicy.ts';

Deno.test('ReplyBotPolicy blocks replies within the same second', async () => {
  const store = new MockRelay();
  const policy = new ReplyBotPolicy({ store });

  const event = genEvent({ kind: 1, created_at: 0 });
  const reply = genEvent({ kind: 1, created_at: 1, tags: [['e', event.id]] });

  await store.event(event);

  const [, , ok] = await policy.call(reply);

  assertEquals(ok, false);
});

Deno.test('ReplyBotPolicy allows replies after 1 second', async () => {
  const store = new MockRelay();
  const policy = new ReplyBotPolicy({ store });

  const event = genEvent({ kind: 1, created_at: 0 });
  const reply = genEvent({ kind: 1, created_at: 2, tags: [['e', event.id]] });

  await store.event(event);

  const [, , ok] = await policy.call(reply);

  assertEquals(ok, true);
});

Deno.test('ReplyBotPolicy allows replies within the same second from users who are tagged', async () => {
  const store = new MockRelay();
  const policy = new ReplyBotPolicy({ store });

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const event = genEvent({ kind: 1, created_at: 0, tags: [['p', pubkey]] });
  const reply = genEvent({ kind: 1, created_at: 1, tags: [['e', event.id]] }, sk);

  await store.event(event);

  const [, , ok] = await policy.call(reply);

  assertEquals(ok, true);
});
