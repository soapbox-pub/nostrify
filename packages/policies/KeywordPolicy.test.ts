import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { KeywordPolicy } from "./KeywordPolicy.ts";

await test("KeywordPolicy", async () => {
  const words = ["https://t.me/spam", "hello world"];

  const event1 = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event2 = finalizeEvent(
    {
      kind: 1,
      content: "🔥🔥🔥 https://t.me/spam 我想死",
      tags: [],
      created_at: 0,
    },
    generateSecretKey(),
  );

  const event3 = finalizeEvent(
    { kind: 1, content: "hElLo wOrLd!", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await new KeywordPolicy(words).call(event1))[2], true);
  deepStrictEqual((await new KeywordPolicy(words).call(event2))[2], false);
  deepStrictEqual((await new KeywordPolicy([]).call(event2))[2], true);
  deepStrictEqual((await new KeywordPolicy(words).call(event3))[2], false);
});
