import { test } from "node:test";
import NDK from "@nostr-dev-kit/ndk";
import { ok } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import process from "node:process";
import type { NostrEvent } from "@nostrify/types";

import { NDKStore } from "./NDKStore.ts";

test("NDKStore.query", {
  skip: process.env.CI === "true" || process.env.CI === "1",
}, async () => {
  const ndk = new NDK({
    explicitRelayUrls: [
      "wss://relay.mostr.pub",
      "wss://relay.primal.net",
      "wss://relay.nostr.band",
    ],
  });
  await ndk.connect(3000);

  const relay = new NDKStore(ndk);
  const events = await relay.query([{ kinds: [1], limit: 3 }]);

  ok(events.length);
});

test("NDKStore.req", {
  skip: process.env.CI === "true" || process.env.CI === "1",
}, async () => {
  const ndk = new NDK({
    explicitRelayUrls: [
      "wss://relay.mostr.pub",
      "wss://relay.primal.net",
      "wss://relay.nostr.band",
    ],
  });
  await ndk.connect(3000);

  const relay = new NDKStore(ndk);
  const events: NostrEvent[] = [];

  for await (const msg of relay.req([{ kinds: [1], limit: 3 }])) {
    if (msg[0] === "EVENT") {
      events.push(msg[2]);
      break;
    }
  }

  ok(events.length);
});

test("NDKStore.event", {
  skip: process.env.CI === "true" || process.env.CI === "1",
}, async () => {
  const ndk = new NDK({
    explicitRelayUrls: ["wss://relay.mostr.pub"],
  });
  await ndk.connect(3000);

  const relay = new NDKStore(ndk);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content:
      "This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  await relay.event(event);
});
