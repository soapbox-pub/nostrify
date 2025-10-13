import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { AnyPolicy } from "./AnyPolicy.ts";
import { NoOpPolicy } from "./NoOpPolicy.ts";
import { ReadOnlyPolicy } from "./ReadOnlyPolicy.ts";

await test("accepts when all policies accept", async () => {
  const policy = new AnyPolicy([
    new NoOpPolicy(),
    new NoOpPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  deepStrictEqual(ok, true);
});

await test("accepts when some policies reject", async () => {
  const policy = new AnyPolicy([
    new NoOpPolicy(),
    new ReadOnlyPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  deepStrictEqual(ok, true);
});

await test("rejects when all policies reject", async () => {
  const policy = new AnyPolicy([
    new ReadOnlyPolicy(),
    new ReadOnlyPolicy(),
    new ReadOnlyPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  deepStrictEqual(ok, false);
});
