import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { NCache } from "./NCache.ts";

import event1 from "../../fixtures/event-1.json" with { type: "json" };

await test("NCache", async () => {
  const cache = new NCache({
    max: 3000,
    maxEntrySize: 5000,
    sizeCalculation: (event) => JSON.stringify(event).length,
  });

  deepStrictEqual(await cache.count([{ ids: [event1.id] }]), {
    count: 0,
    approximate: false,
  });

  await cache.event(event1);

  deepStrictEqual(await cache.count([{ ids: [event1.id] }]), {
    count: 1,
    approximate: false,
  });

  const result = await cache.query([{ ids: [event1.id] }]);
  deepStrictEqual(result[0], event1);
});
