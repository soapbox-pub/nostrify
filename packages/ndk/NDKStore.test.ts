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
    // FIXME: this test will always fail when mostr.pub is used here, since mostr.pub does not allow authors without kind 0s.
    explicitRelayUrls: ["wss://relay.mostr.pub"],
  });
  await ndk.connect(3000);

  const relay = new NDKStore(ndk);

  // added the timestamp because mostr.pub will prevent you from spamming the relay with messages with duplicate content
  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content:
      `This is an automated test from Nostrify (https://gitlab.com/soapbox-pub/nostrify) initiated at ${
        new Date().toUTCString()
      }`,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());
  try {
    await relay.event(event);
  } catch (e) {
    console.error("ERROR:", e);
  }
});
