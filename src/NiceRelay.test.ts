import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { finalizeEvent, generateSecretKey } from 'npm:nostr-tools@^2.3.1';

import { NostrEvent } from '../interfaces/NostrEvent.ts';

import { NiceRelay } from './NiceRelay.ts';

Deno.test('NiceRelay.query', async () => {
  const relay = new NiceRelay('wss://relay.mostr.pub');

  const events = await relay.query([{ kinds: [1], limit: 3 }]);

  assertEquals(events.length, 3);

  await relay.close();
});

Deno.test('NiceRelay.req', async () => {
  const relay = new NiceRelay('wss://relay.mostr.pub');

  const events: NostrEvent[] = [];

  for await (const msg of relay.req([{ kinds: [1], limit: 3 }])) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
      break;
    }
  }

  assertEquals(events.length, 1);

  await relay.close();
});

Deno.test('NiceRelay.event', async () => {
  const relay = new NiceRelay('wss://relay.mostr.pub');

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: 'This is an automated test from NSpec: https://gitlab.com/soapbox-pub/NSpec',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);

  await relay.close();
});
