import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { NoOpPolicy } from "./NoOpPolicy.ts";
import { PipePolicy } from "./PipePolicy.ts";
import { ReadOnlyPolicy } from "./ReadOnlyPolicy.ts";

await test("passes events through multiple policies", async () => {
  const policy = new PipePolicy([
    new NoOpPolicy(),
    new ReadOnlyPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  deepStrictEqual(ok, false);
  deepStrictEqual(reason, "blocked: the relay is read-only");
});

await test("short-circuits on the first reject", async () => {
  const policy = new PipePolicy([
    new ReadOnlyPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  deepStrictEqual(ok, false);
  deepStrictEqual(reason, "blocked: the relay is read-only");
});

await test("accepts when all policies accept", async () => {
  const policy = new PipePolicy([
    new NoOpPolicy(),
    new NoOpPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  deepStrictEqual(ok, true);
  deepStrictEqual(reason, "");
});
