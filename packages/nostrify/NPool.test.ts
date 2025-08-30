import { test } from "node:test";
import type { NostrEvent } from "@nostrify/types";
import { deepStrictEqual, ok } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { NPool } from "./NPool.ts";
import { NRelay1 } from "./NRelay1.ts";

import events from "../../fixtures/events.json" with { type: "json" };
import { TestRelayServer } from "./test/TestRelayServer.ts";

const event1s = events
  .filter((e) => e.kind === 1)
  .toSorted((_) => 0.5 - Math.random())
  .slice(0, 10);

await test("NPool.query", async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);

  await using server1 = await TestRelayServer.create();
  await using server2 = await TestRelayServer.create();

  for (const event of event1s) {
    await server1.event(event);
    await server2.event(event);
  }

  await using pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: (filters) =>
      new Map([
        [server1.url, filters],
        [server2.url, filters],
      ]),
    eventRouter: () => [server1.url],
  });

  const events = await pool.query([{ kinds: [1], limit: 15 }]);

  deepStrictEqual(events.length, 10);
  ok(events[0].created_at >= events[1].created_at);

  clearTimeout(tid);
});

await test("NPool.req", async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  await using server1 = await TestRelayServer.create();
  await using server2 = await TestRelayServer.create();

  for (const event of event1s) {
    await server1.event(event);
    await server2.event(event);
  }

  const events: NostrEvent[] = [];

  await using pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: (filters) =>
      new Map([
        [server1.url, filters],
        [server2.url, filters],
      ]),
    eventRouter: () => [server1.url],
  });

  for await (
    const msg of pool.req([{ kinds: [1], limit: 3 }], {
      signal: controller.signal,
    })
  ) {
    if (msg[0] === "EVENT") {
      events.push(msg[2]);
    }

    if (events.length === 3) break;
  }

  deepStrictEqual(events.length, 3);

  clearTimeout(tid);
});

await test("NPool.event", async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);

  await using server1 = await TestRelayServer.create();
  await using server2 = await TestRelayServer.create();

  for (const event of event1s) {
    await server1.event(event);
    await server2.event(event);
  }

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content:
      "This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify",
    tags: [["unique", "uniqueTag"]],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await using pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: (filters) =>
      new Map([
        [server1.url, filters],
        [server2.url, filters],
      ]),
    eventRouter: () => [server1.url],
  });

  await pool.event(event, { signal: controller.signal });

  deepStrictEqual(
    (await pool.query([{ kinds: [1], "#unique": ["uniqueTag"] }], {
      signal: controller.signal,
    })).length,
    1,
  );

  clearTimeout(tid);
});
