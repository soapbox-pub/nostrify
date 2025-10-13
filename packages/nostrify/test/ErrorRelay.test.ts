import { test } from "node:test";
import { genEvent } from "./mod.ts";
import { rejects } from "node:assert";

import { ErrorRelay } from "./ErrorRelay.ts";

await test("ErrorRelay", async () => {
  const store = new ErrorRelay();
  await rejects(() => store.event(genEvent()));
  await rejects(() => store.query([]));
  await rejects(() => store.count([]));
  await rejects(() => store.remove([]));
  await rejects(() => store.close());

  await rejects(async () => {
    for await (const _ of store.req([])) {
      // Do nothing.
    }
  });
});
