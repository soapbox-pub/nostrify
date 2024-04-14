import { assert, assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { finalizeEvent, generateSecretKey } from 'npm:nostr-tools@^2.3.1';

import { NostrEvent } from '../interfaces/NostrEvent.ts';

import { NRelay1 } from './NRelay1.ts';

Deno.test('NRelay1.query', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const relay = new NRelay1('wss://relay.nostr.band');
  const events = await relay.query([{ kinds: [1], limit: 3 }], { signal: controller.signal });

  assertEquals(events.length, 3);
  assert(events[0].created_at >= events[1].created_at);

  await relay.close();
  clearTimeout(tid);
});

Deno.test('NRelay1.req', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const relay = new NRelay1('wss://relay.nostr.band');
  const events: NostrEvent[] = [];

  for await (const msg of relay.req([{ kinds: [1], limit: 3 }], { signal: controller.signal })) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
      break;
    }
  }

  assertEquals(events.length, 1);

  await relay.close();
  clearTimeout(tid);
});

Deno.test('NRelay1.event', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const relay = new NRelay1('wss://relay.mostr.pub');

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: 'This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event, { signal: controller.signal });

  await relay.close();
  clearTimeout(tid);
});
