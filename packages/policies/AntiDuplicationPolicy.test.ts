import { test } from "node:test";
import { genEvent } from "@nostrify/nostrify/test";
import { deepStrictEqual } from "node:assert";
import { openKv } from "@deno/kv";

import { AntiDuplicationPolicy } from "./AntiDuplicationPolicy.ts";

await test("AntiDuplicationPolicy", async () => {
  const kv = await openKv(":memory:");
  try {
    const policy = new AntiDuplicationPolicy({ kv });
    const content =
      "Spicy peppermint apricot mediterranean ginger carrot spiced juice edamame hummus";

    const event1 = genEvent({ kind: 1, content });

    deepStrictEqual((await policy.call(event1))[2], true);
    deepStrictEqual((await policy.call(event1))[2], false);
    deepStrictEqual((await policy.call(event1))[2], false);

    const event2 = genEvent({ kind: 1, content: "a" });

    deepStrictEqual((await policy.call(event2))[2], true);
    deepStrictEqual((await policy.call(event2))[2], true);
  } finally {
    await kv.close();
  }
});

await test("AntiDuplicationPolicy with deobfuscate", async () => {
  const kv = await openKv(":memory:");
  try {
    const policy = new AntiDuplicationPolicy({
      kv,
      deobfuscate: ({ content }) => (
        content
          .replace(
            /[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}]/gu,
            "",
          )
          .replace(/\s/g, "")
          .toLowerCase()
      ),
    });

    const event1 = genEvent({
      kind: 1,
      content:
        "Spicy peppermint apricot mediterranean ginger carrot spiced juice edamame hummus",
    });

    const event2 = genEvent({
      kind: 1,
      content:
        "Spicy 🌶️  peppermint apricot 🍑 mediterranean 🌊 ginger carrot 🥕 spiced 🌶️ juice 🥤 edamame 🌱  hummus ",
    });

    deepStrictEqual((await policy.call(event1))[2], true);
    deepStrictEqual((await policy.call(event2))[2], false);
  } finally {
    await kv.close();
  }
});
