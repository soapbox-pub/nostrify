import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { RegexPolicy } from "./RegexPolicy.ts";

await test("RegexPolicy", async () => {
  const event = finalizeEvent(
    {
      kind: 1,
      content: "🔥🔥🔥 https://t.me/spam 我想死",
      tags: [],
      created_at: 0,
    },
    generateSecretKey(),
  );

  deepStrictEqual(
    (await new RegexPolicy(/https:\/\/t\.me\/\w+/i).call(event))[2],
    false,
  );
  deepStrictEqual((await new RegexPolicy(/🔥{1,3}/).call(event))[2], false);
  deepStrictEqual((await new RegexPolicy(/🔥{4}/).call(event))[2], true);
  deepStrictEqual((await new RegexPolicy(/🔥$/).call(event))[2], true);
  deepStrictEqual((await new RegexPolicy(/^🔥/).call(event))[2], false);
});

await test("RegexPolicy blocks consistently with a sticky or global regex", async () => {
  const event = finalizeEvent(
    { kind: 1, content: "https://t.me/spam", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  // `lastIndex` on a `g`/`y` regex used to persist between calls, so the same
  // event would be blocked, then allowed, then blocked again.
  for (const regex of [/https:\/\/t\.me\/\w+/g, /https:\/\/t\.me\/\w+/y]) {
    const policy = new RegexPolicy(regex);

    deepStrictEqual((await policy.call(event))[2], false);
    deepStrictEqual((await policy.call(event))[2], false);
    deepStrictEqual((await policy.call(event))[2], false);
  }
});
