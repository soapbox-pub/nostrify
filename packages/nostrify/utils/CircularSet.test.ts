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

await test("CircularSet evicts a falsy member", () => {
  const set = new CircularSet<number>(3);

  // The oldest member is `0`, which is a member like any other.
  set.add(0);
  set.add(1);
  set.add(2);
  set.add(3);

  deepStrictEqual([...set], [1, 2, 3]);
});
