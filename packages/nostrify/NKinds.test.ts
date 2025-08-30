import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { NKinds } from "./NKinds.ts";

await test("NKinds", () => {
  deepStrictEqual(NKinds.regular(1000), true);
  deepStrictEqual(NKinds.regular(10000), false);
  deepStrictEqual(NKinds.regular(0), false);
  deepStrictEqual(NKinds.regular(44), true);
  deepStrictEqual(NKinds.regular(45), false);
  deepStrictEqual(NKinds.regular(100000), false);

  deepStrictEqual(NKinds.replaceable(1000), false);
  deepStrictEqual(NKinds.replaceable(10000), true);
  deepStrictEqual(NKinds.replaceable(0), true);
  deepStrictEqual(NKinds.replaceable(3), true);
  deepStrictEqual(NKinds.replaceable(44), false);
  deepStrictEqual(NKinds.replaceable(45), false);
  deepStrictEqual(NKinds.replaceable(100000), false);

  deepStrictEqual(NKinds.ephemeral(1000), false);
  deepStrictEqual(NKinds.ephemeral(10000), false);
  deepStrictEqual(NKinds.ephemeral(0), false);
  deepStrictEqual(NKinds.ephemeral(3), false);
  deepStrictEqual(NKinds.ephemeral(44), false);
  deepStrictEqual(NKinds.ephemeral(45), false);
  deepStrictEqual(NKinds.ephemeral(20000), true);
  deepStrictEqual(NKinds.ephemeral(30000), false);
  deepStrictEqual(NKinds.ephemeral(40000), false);
  deepStrictEqual(NKinds.ephemeral(100000), false);

  deepStrictEqual(NKinds.addressable(1000), false);
  deepStrictEqual(NKinds.addressable(10000), false);
  deepStrictEqual(NKinds.addressable(0), false);
  deepStrictEqual(NKinds.addressable(3), false);
  deepStrictEqual(NKinds.addressable(44), false);
  deepStrictEqual(NKinds.addressable(45), false);
  deepStrictEqual(NKinds.addressable(20000), false);
  deepStrictEqual(NKinds.addressable(30000), true);
  deepStrictEqual(NKinds.addressable(40000), false);
  deepStrictEqual(NKinds.addressable(100000), false);
});
