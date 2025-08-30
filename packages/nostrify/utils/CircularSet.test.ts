import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { CircularSet } from "./CircularSet.ts";

await test("CircularSet", () => {
  const set = new CircularSet<number>(3);

  set.add(1);
  set.add(2);
  set.add(3);
  set.add(3);
  set.add(4);

  deepStrictEqual([...set], [2, 3, 4]);
});
