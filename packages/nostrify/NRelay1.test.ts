import { NostrEvent } from '@nostrify/types';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { WebsocketEvent } from 'websocket-ts';

import { TestRelayServer } from './test/TestRelayServer.ts';
import { NRelay1 } from './NRelay1.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

const event1s = events
  .filter((e) => e.kind === 1)
  .toSorted((_) => 0.5 - Math.random())
  .slice(0, 10);

Deno.test('NRelay1.query', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  await using server = new TestRelayServer();

  for (const event of event1s) {
    await server.event(event);
  }

  await using relay = new NRelay1(server.url);
  const events = await relay.query([{ kinds: [1], limit: 3 }], { signal: controller.signal });

  assertEquals(events.length, 3);
  assert(events[0].created_at >= events[1].created_at);

  clearTimeout(tid);
});

Deno.test('NRelay1.req', async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  await using server = new TestRelayServer();

  for (const event of event1s) {
    await server.event(event);
  }

  await using relay = new NRelay1(server.url);
  const events: NostrEvent[] = [];

  for await (const msg of relay.req([{ kinds: [1], limit: 3 }], { signal: controller.signal })) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
      break;
    }
  }

  assertEquals(events.length, 1);

  clearTimeout(tid);
});

Deno.test('NRelay1.event', async () => {
  await using server = new TestRelayServer();
  await using relay = new NRelay1(server.url);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: 'This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);
});

Deno.test('NRelay1 backoff', async (t) => {
  await using server = new TestRelayServer();
  await using relay = new NRelay1(server.url);

  await t.step('websocket opens', async () => {
    await new Promise((resolve) => relay.socket.addEventListener(WebsocketEvent.open, resolve, { once: true }));
    assertEquals(relay.socket.readyState, WebSocket.OPEN);
  });

  // Start a subscription so the relay will reconnect
  (async () => {
    try {
      for await (const _msg of relay.req([{ kinds: [0] }])) {
        // Do nothing
      }
    } catch {
      //
    }
  })();

  await t.step('websocket closes when server closes', async () => {
    const waitForClose = new Promise((resolve) =>
      relay.socket.addEventListener(WebsocketEvent.close, resolve, { once: true })
    );
    await server.close();
    await waitForClose;
    assertEquals(relay.socket.readyState, WebSocket.CLOSED);
  });

  await t.step('websocket reopens when server reopens', async () => {
    server.open();
    await new Promise((resolve) => relay.socket.addEventListener(WebsocketEvent.open, resolve, { once: true }));
    assertEquals(relay.socket.readyState, WebSocket.OPEN);
  });
});

Deno.test('NRelay1 idleTimeout', async (t) => {
  await using server = new TestRelayServer();
  await using relay = new NRelay1(server.url, { idleTimeout: 100 });

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
});

Deno.test('NRelay1.count rejects when the server sends CLOSED', async () => {
  await using server = new TestRelayServer({
    // deno-lint-ignore require-await
    async handleMessage(socket, msg) {
      if (msg[0] === 'COUNT') {
        server.send(socket, ['CLOSED', msg[1], 'unsupported: COUNT is not supported']);
      }
    },
  });

  await using relay = new NRelay1(server.url);

  await assertRejects(() => relay.count([{ kinds: [1] }]));
});

Deno.test('NRelay1 closes when it receives a binary message', async () => {
  await using server = new TestRelayServer({
    // deno-lint-ignore require-await
    async handleMessage(socket) {
      socket.send(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    },
  });

  await using relay = new NRelay1(server.url);

  await assertRejects(() => relay.query([{ kinds: [1] }]));
});
