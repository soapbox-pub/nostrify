import { test } from "node:test";
import { genEvent, MockRelay } from "@nostrify/nostrify/test";
import { deepStrictEqual } from "node:assert";
import { generateSecretKey } from "nostr-tools";

import { AuthorPolicy } from "./AuthorPolicy.ts";

await test("AuthorPolicy", async () => {
  const store = new MockRelay();
  const policy = new AuthorPolicy(store);

  const sk = generateSecretKey();
  const event = genEvent({ kind: 1 }, sk);

  const [, , ok1] = await policy.call(event);

  deepStrictEqual(ok1, false);

  await store.event(genEvent({ kind: 0 }, sk));

  const [, , ok2] = await policy.call(event);

  deepStrictEqual(ok2, true);
});
