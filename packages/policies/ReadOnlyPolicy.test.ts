import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { ReadOnlyPolicy } from "./ReadOnlyPolicy.ts";

await test("ReadOnlyPolicy", async () => {
  const policy = new ReadOnlyPolicy();

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, eventId, ok, reason] = await policy.call(event);

  deepStrictEqual(eventId, event.id);
  deepStrictEqual(reason, "blocked: the relay is read-only");
  deepStrictEqual(ok, false);
});
