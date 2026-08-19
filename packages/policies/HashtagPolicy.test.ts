import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

import { HashtagPolicy } from "./HashtagPolicy.ts";

await test("HashtagPolicy", async () => {
  const hashtags = ["nsfw"];

  const event1 = finalizeEvent(
    { kind: 1, content: "", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event2 = finalizeEvent(
    {
      kind: 1,
      content: "",
      tags: [["t", "nsfw"], ["t", "other"]],
      created_at: 0,
    },
    generateSecretKey(),
  );

  const event3 = finalizeEvent(
    { kind: 1, content: "nsfw", tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event4 = finalizeEvent(
    {
      kind: 1,
      content: "",
      tags: [["p", "nsfw"], ["t", "other"]],
      created_at: 0,
    },
    generateSecretKey(),
  );

  deepStrictEqual((await new HashtagPolicy(hashtags).call(event1))[2], true);
  deepStrictEqual((await new HashtagPolicy(hashtags).call(event2))[2], false);
  deepStrictEqual((await new HashtagPolicy([]).call(event2))[2], true);
  deepStrictEqual((await new HashtagPolicy(hashtags).call(event3))[2], true);
  deepStrictEqual((await new HashtagPolicy(hashtags).call(event4))[2], true);
});

await test("HashtagPolicy tolerates a tag with no value", async () => {
  const event = finalizeEvent(
    { kind: 1, content: "", tags: [["t"]], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await new HashtagPolicy(["nsfw"]).call(event))[2], true);
});

await test("HashtagPolicy matches regardless of case", async () => {
  const event = finalizeEvent(
    { kind: 1, content: "", tags: [["t", "NSFW"]], created_at: 0 },
    generateSecretKey(),
  );

  // Banned hashtag given in either case must block a tag given in either case.
  deepStrictEqual((await new HashtagPolicy(["nsfw"]).call(event))[2], false);
  deepStrictEqual((await new HashtagPolicy(["NSFW"]).call(event))[2], false);
});
