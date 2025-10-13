import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { NoOpPolicy } from "./NoOpPolicy.ts";

await test("NoOpPolicy", async () => {
  const policy = new NoOpPolicy();

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, eventId, ok] = await policy.call(event);

  deepStrictEqual(eventId, event.id);
  deepStrictEqual(ok, true);
});
