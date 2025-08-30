import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { MockRelay } from "./MockRelay.ts";

import event1 from "../../../fixtures/event-1.json" with { type: "json" };

await test("MockRelay", async () => {
  const relay = new MockRelay();

  deepStrictEqual(await relay.count([{ ids: [event1.id] }]), {
    count: 0,
    approximate: false,
  });

  await relay.event(event1);

  deepStrictEqual(await relay.count([{ ids: [event1.id] }]), {
    count: 1,
    approximate: false,
  });

  const result = await relay.query([{ ids: [event1.id] }]);
  deepStrictEqual(result[0], event1);

  deepStrictEqual(relay.subs.size, 0); // cleanup
});
