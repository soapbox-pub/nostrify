import { NostrEvent } from '@nostrify/types';
import { assert, assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { MockRelayWs } from './test/MockRelayWs.ts';
import { NRelay1 } from './NRelay1.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

const event1s = events
  .filter((e) => e.kind === 1)
  .toSorted((_) => 0.5 - Math.random())
  .slice(0, 10);

Deno.test('NRelay1.query', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const server = new MockRelayWs('wss://mock.relay', event1s);
  const relay = new NRelay1('wss://mock.relay/');
  const events = await relay.query([{ kinds: [1], limit: 3 }], { signal: controller.signal });

  assertEquals(events.length, 3);
  assert(events[0].created_at >= events[1].created_at);

  await relay.close();
  server.close();
  clearTimeout(tid);
});

Deno.test('NRelay1.req', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const server = new MockRelayWs('wss://mock.relay', event1s);
  const relay = new NRelay1('wss://mock.relay/');
  const events: NostrEvent[] = [];

  for await (const msg of relay.req([{ kinds: [1], limit: 3 }], { signal: controller.signal })) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
      break;
    }
  }

  assertEquals(events.length, 1);

  await relay.close();
  server.close();
  clearTimeout(tid);
});

Deno.test('NRelay1.event', async () => {
  const server = new MockRelayWs('wss://mock.relay');
  const relay = new NRelay1('wss://mock.relay/');

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: 'This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);
  await relay.close();
  server.close();
});

Deno.test('NRelay1 idleTimeout', async (t) => {
  const server = new MockRelayWs('wss://mock.relay');
  const relay = new NRelay1('wss://mock.relay/', { idleTimeout: 100 });

  await t.step('websocket opens', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(relay.socket.readyState, WebSocket.OPEN);
  });

  await t.step('websocket closes after idleTimeout', async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertEquals(relay.socket.readyState, WebSocket.CLOSED);
    assertEquals(relay.socket.closedByUser, true);
  });

  await t.step('websocket wakes up during activity', async () => {
    await relay.event(events[0]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(relay.socket.readyState, WebSocket.OPEN);
  });

  await relay.close();
  server.close();
});
