import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { genEvent, MockRelay } from "@nostrify/nostrify/test";
import { generateSecretKey, getPublicKey } from "nostr-tools";

import { ReplyBotPolicy } from "./ReplyBotPolicy.ts";

await test("ReplyBotPolicy blocks replies within the same second", async () => {
  const store = new MockRelay();
  try {
    const policy = new ReplyBotPolicy({ store });

    const event = genEvent({ kind: 1, created_at: 0 });
    const reply = genEvent({ kind: 1, created_at: 1, tags: [["e", event.id]] });

    await store.event(event);

    const [, , ok] = await policy.call(reply);

    deepStrictEqual(ok, false);
  } finally {
    await store.close();
  }
});

await test("ReplyBotPolicy allows replies after 1 second", async () => {
  const store = new MockRelay();
  try {
    const policy = new ReplyBotPolicy({ store });

    const event = genEvent({ kind: 1, created_at: 0 });
    const reply = genEvent({ kind: 1, created_at: 2, tags: [["e", event.id]] });

    await store.event(event);

    const [, , ok] = await policy.call(reply);

    deepStrictEqual(ok, true);
  } finally {
    await store.close();
  }
});

await test("ReplyBotPolicy allows replies within the same second from users who are tagged", async () => {
  const store = new MockRelay();
  try {
    const policy = new ReplyBotPolicy({ store });

    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);

    const event = genEvent({ kind: 1, created_at: 0, tags: [["p", pubkey]] });
    const reply = genEvent(
      { kind: 1, created_at: 1, tags: [["e", event.id]] },
      sk,
    );

    await store.event(event);

    const [, , ok] = await policy.call(reply);

    deepStrictEqual(ok, true);
  } finally {
    await store.close();
  }
});
