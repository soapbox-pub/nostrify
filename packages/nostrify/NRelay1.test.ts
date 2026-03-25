import { it, test } from "node:test";
import type { NostrClientMsg, NostrEvent } from "@nostrify/types";
import { deepStrictEqual, ok, rejects } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { ExponentialBackoff, WebsocketEvent } from "websocket-ts";

import { genEvent } from "./test/mod.ts";
import { TestRelayServer } from "./test/TestRelayServer.ts";
import { NRelay1 } from "./NRelay1.ts";

import events from "../../fixtures/events.json" with { type: "json" };

const event1s = events
  .filter((e) => e.kind === 1)
  .toSorted((_) => 0.5 - Math.random())
  .slice(0, 10);

await test("NRelay1.query", async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  await using server = await TestRelayServer.create();

  for (const event of event1s) {
    await server.event(event);
  }

  await using relay = new NRelay1(server.url);
  const events = await relay.query([{ kinds: [1], limit: 3 }], {
    signal: controller.signal,
  });

  deepStrictEqual(events.length, 3);
  ok(events[0].created_at >= events[1].created_at);

  clearTimeout(tid);
});

await test("NRelay1.query with NIP-50 search preserves relay order", async () => {
  // Create events with different timestamps. The relay will send them
  // in "relevance" order (oldest first), not chronological order.
  const sk = generateSecretKey();
  const oldest = genEvent({ kind: 1, content: "most relevant", created_at: 1000 }, sk);
  const middle = genEvent({ kind: 1, content: "somewhat relevant", created_at: 2000 }, sk);
  const newest = genEvent({ kind: 1, content: "least relevant", created_at: 3000 }, sk);

  // Relay sends in relevance order: oldest, middle, newest.
  // Without the fix, NSet would sort them newest-first by created_at.
  await using server = await TestRelayServer.create({
    handleMessage(socket, msg) {
      if (msg[0] === "REQ") {
        const [, subId] = msg;
        socket.send(JSON.stringify(["EVENT", subId, oldest]));
        socket.send(JSON.stringify(["EVENT", subId, middle]));
        socket.send(JSON.stringify(["EVENT", subId, newest]));
        socket.send(JSON.stringify(["EOSE", subId]));
      }
    },
  });

  await using relay = new NRelay1(server.url);
  const events = await relay.query([{ kinds: [1], search: "relevant" }]);

  deepStrictEqual(events.length, 3);
  // Results should preserve relay order (relevance), not be sorted by created_at.
  deepStrictEqual(events[0].id, oldest.id);
  deepStrictEqual(events[1].id, middle.id);
  deepStrictEqual(events[2].id, newest.id);
});

await test("NRelay1.query mismatched filter", async () => {
  await using server = await TestRelayServer.create({
    handleMessage(socket, msg) {
      if (msg[0] === "REQ") {
        const [, subId, ..._filters] = msg;
        socket.send(JSON.stringify(["EVENT", subId, genEvent({ kind: 9001 })]));
        socket.send(JSON.stringify(["EOSE", subId]));
      }
    },
  });

  await using relay = new NRelay1(server.url);
  const events = await relay.query([{ kinds: [1] }]);

  deepStrictEqual(events, []);
});

await test("NRelay1.req", async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  await using server = await TestRelayServer.create();

  for (const event of event1s) {
    await server.event(event);
  }

  await using relay = new NRelay1(server.url);
  const events: NostrEvent[] = [];

  for await (
    const msg of relay.req([{ kinds: [1], limit: 3 }], {
      signal: controller.signal,
    })
  ) {
    if (msg[0] === "EVENT") {
      events.push(msg[2]);
      break;
    }
  }

  deepStrictEqual(events.length, 1);

  clearTimeout(tid);
});

await test("NRelay1.event sends while connection is open", async () => {
  await using server = await TestRelayServer.create();
  await using relay = new NRelay1(server.url);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content:
      "This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);
});

await test("NRelay1.event sends before connection is open", async () => {
  await using server = await TestRelayServer.create();
  await using relay = new NRelay1(server.url);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: "Sent before connection was established",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  // Send immediately without waiting for the connection to open.
  // The ArrayQueue buffer should hold the message and deliver it
  // once the socket opens.
  await relay.event(event);
});

await test("NRelay1.event throws when OK is false", async () => {
  await using server = await TestRelayServer.create({
    handleMessage(socket, msg) {
      if (msg[0] === "EVENT") {
        server.send(socket, ["OK", msg[1].id, false, "blocked: not allowed"]);
      }
    },
  });

  await using relay = new NRelay1(server.url);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: "This event should be rejected",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await rejects(() => relay.event(event), /blocked: not allowed/);
});

await test("NRelay1.event sends after reconnect from CLOSING state", async () => {
  await using server = await TestRelayServer.create();
  await using relay = new NRelay1(server.url, {
    backoff: new ExponentialBackoff(100),
  });

  await new Promise<void>((resolve) =>
    relay.socket.addEventListener(WebsocketEvent.open, () => resolve(), {
      once: true,
    })
  );

  server.dropConnections();

  // Wait briefly for the socket to register as closed.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: "Sent while connection was closing, delivered after reconnect",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);
});

test.skip("NRelay1 backoff", async () => {
  await using server = await TestRelayServer.create();
  await using relay = new NRelay1(server.url);

  await it("websocket opens", async () => {
    await new Promise((resolve) =>
      relay.socket.addEventListener(WebsocketEvent.open, resolve, {
        once: true,
      })
    );
    deepStrictEqual(relay.socket.readyState, WebSocket.OPEN);
  });

  await it("websocket closes when server closes", async () => {
    const waitForClose = new Promise((resolve) =>
      relay.socket.addEventListener(WebsocketEvent.close, resolve, {
        once: true,
      })
    );
    await server.close();
    await waitForClose;
    deepStrictEqual(relay.socket.readyState, WebSocket.CLOSED);
  });

  await it("websocket reopens when server reopens", async () => {
    await server.open();

    // The relay should reconnect when we start a new subscription
    // We'll start the subscription and give it some time to connect
    const con = new AbortController();

    const subscriptionPromise = (async () => {
      try {
        for await (
          const _msg of relay.req([{ kinds: [0] }], { signal: con.signal })
        ) {
          break;
        }
      } catch {
        // Connection errors are expected during reconnection
      }
    })();

    // Give the connection some time to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // The websocket should now be open (either immediately or after reconnection)
    deepStrictEqual(relay.socket.readyState, WebSocket.OPEN);

    // Clean up subscription
    con.abort();
    await subscriptionPromise.catch(() => {});
  });
});

await test("NRelay1 idleTimeout", async () => {
  await using server = await TestRelayServer.create();
  await using relay = new NRelay1(server.url, { idleTimeout: 100 });

  await it("websocket opens", async () => {
    await new Promise((resolve) =>
      relay.socket.addEventListener(WebsocketEvent.open, resolve, {
        once: true,
      })
    );
    deepStrictEqual(relay.socket.readyState, WebSocket.OPEN);
  });

  await it("websocket closes after idleTimeout", async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    deepStrictEqual(relay.socket.readyState, WebSocket.CLOSED);
    deepStrictEqual(relay.socket.closedByUser, true);
  });

  await it("websocket wakes up during activity", async () => {
    await relay.event(events[0]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    deepStrictEqual(relay.socket.readyState, WebSocket.OPEN);
  });
});

await test("NRelay1.count rejects when the server sends CLOSED", async () => {
  await using server = await TestRelayServer.create({
    handleMessage(socket, msg) {
      if (msg[0] === "COUNT") {
        server.send(socket, [
          "CLOSED",
          msg[1],
          "unsupported: COUNT is not supported",
        ]);
      }
    },
  });

  await using relay = new NRelay1(server.url);

  await rejects(() => relay.count([{ kinds: [1] }]));
});

await test("NRelay1 closes when it receives a binary message", async () => {
  await using server = await TestRelayServer.create({
    handleMessage(socket) {
      socket.send(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    },
  });

  await using relay = new NRelay1(server.url);

  await rejects(() => relay.query([{ kinds: [1] }]));
});

await test("NRelay1 NIP-42 auth-required REQ retry", async () => {
  const sk = generateSecretKey();
  const testEvent = genEvent({ kind: 4, content: "secret DM" }, sk);

  let reqCount = 0;

  await using server = await TestRelayServer.create({
    handleMessage(socket, msg: NostrClientMsg) {
      if (msg[0] === "REQ") {
        const [, subId] = msg;
        reqCount++;
        if (reqCount === 1) {
          // First REQ: send AUTH challenge, then reject with auth-required
          socket.send(JSON.stringify(["AUTH", "challenge123"]));
          socket.send(JSON.stringify(["CLOSED", subId, "auth-required: authentication required"]));
        } else {
          // Second REQ (after auth): serve the events
          socket.send(JSON.stringify(["EVENT", subId, testEvent]));
          socket.send(JSON.stringify(["EOSE", subId]));
        }
      }
      if (msg[0] === "AUTH") {
        // Accept the AUTH event
        socket.send(JSON.stringify(["OK", msg[1].id, true, ""]));
      }
    },
  });

  await using relay = new NRelay1(server.url, {
    auth: async (challenge) => {
      return genEvent({
        kind: 22242,
        tags: [["relay", server.url], ["challenge", challenge]],
      }, sk);
    },
  });

  const result = await relay.query([{ kinds: [4] }]);

  deepStrictEqual(result.length, 1);
  deepStrictEqual(result[0].id, testEvent.id);
  deepStrictEqual(reqCount, 2);
});

await test("NRelay1 NIP-42 auth-required EVENT retry", async () => {
  const sk = generateSecretKey();
  const eventToPublish: NostrEvent = finalizeEvent({
    kind: 1,
    content: "Hello from authenticated user",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, sk);

  let eventCount = 0;

  await using server = await TestRelayServer.create({
    handleMessage(socket, msg: NostrClientMsg) {
      if (msg[0] === "EVENT") {
        eventCount++;
        if (eventCount === 1) {
          // First EVENT: send AUTH challenge, then reject with auth-required
          socket.send(JSON.stringify(["AUTH", "challenge456"]));
          socket.send(JSON.stringify(["OK", msg[1].id, false, "auth-required: authentication required"]));
        } else {
          // Second EVENT (after auth): accept
          socket.send(JSON.stringify(["OK", msg[1].id, true, ""]));
        }
      }
      if (msg[0] === "AUTH") {
        // Accept the AUTH event
        socket.send(JSON.stringify(["OK", msg[1].id, true, ""]));
      }
    },
  });

  await using relay = new NRelay1(server.url, {
    auth: async (challenge) => {
      return genEvent({
        kind: 22242,
        tags: [["relay", server.url], ["challenge", challenge]],
      }, sk);
    },
  });

  // Should succeed after automatic auth + retry
  await relay.event(eventToPublish);
  deepStrictEqual(eventCount, 2);
});

await test("NRelay1 NIP-42 auth-required does not retry without auth callback", async () => {
  let reqCount = 0;

  await using server = await TestRelayServer.create({
    handleMessage(socket, msg: NostrClientMsg) {
      if (msg[0] === "REQ") {
        reqCount++;
        const [, subId] = msg;
        socket.send(JSON.stringify(["CLOSED", subId, "auth-required: authentication required"]));
      }
    },
  });

  // No auth callback provided — CLOSED should pass through without retry
  await using relay = new NRelay1(server.url);

  const result = await relay.query([{ kinds: [4] }]);
  deepStrictEqual(result, []);
  deepStrictEqual(reqCount, 1);
});

await test("NRelay1 NIP-42 auth-required does not retry infinitely", async () => {
  const sk = generateSecretKey();
  let reqCount = 0;

  await using server = await TestRelayServer.create({
    handleMessage(socket, msg: NostrClientMsg) {
      if (msg[0] === "REQ") {
        const [, subId] = msg;
        reqCount++;
        // Send AUTH challenge on first REQ only
        if (reqCount === 1) {
          socket.send(JSON.stringify(["AUTH", "challenge789"]));
        }
        // Always reject with auth-required, even after auth
        socket.send(JSON.stringify(["CLOSED", subId, "auth-required: still not allowed"]));
      }
      if (msg[0] === "AUTH") {
        socket.send(JSON.stringify(["OK", msg[1].id, true, ""]));
      }
    },
  });

  await using relay = new NRelay1(server.url, {
    auth: async (challenge) => {
      return genEvent({
        kind: 22242,
        tags: [["relay", server.url], ["challenge", challenge]],
      }, sk);
    },
  });

  // Should stop after one retry (reqCount=2), not loop forever
  const result = await relay.query([{ kinds: [4] }]);
  deepStrictEqual(result, []);
  deepStrictEqual(reqCount, 2);
});
