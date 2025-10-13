import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { NSet } from "./NSet.ts";

await test("NSet", () => {
  const set = new NSet();
  deepStrictEqual(set.size, 0);

  const event = {
    id: "1",
    kind: 0,
    pubkey: "abc",
    content: "",
    created_at: 0,
    sig: "",
    tags: [],
  };
  set.add(event);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event), true);

  set.add(event);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event), true);

  set.delete(event);
  deepStrictEqual(set.size, 0);
  deepStrictEqual(set.has(event), false);

  set.delete(event);
  deepStrictEqual(set.size, 0);
  deepStrictEqual(set.has(event), false);

  set.add(event);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event), true);

  set.clear();
  deepStrictEqual(set.size, 0);
  deepStrictEqual(set.has(event), false);
});

await test("NSet.add (replaceable)", () => {
  const event0 = {
    id: "1",
    kind: 0,
    pubkey: "abc",
    content: "",
    created_at: 0,
    sig: "",
    tags: [],
  };
  const event1 = {
    id: "2",
    kind: 0,
    pubkey: "abc",
    content: "",
    created_at: 1,
    sig: "",
    tags: [],
  };
  const event2 = {
    id: "3",
    kind: 0,
    pubkey: "abc",
    content: "",
    created_at: 2,
    sig: "",
    tags: [],
  };

  const set = new NSet();
  set.add(event0);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), true);

  set.add(event1);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), false);
  deepStrictEqual(set.has(event1), true);

  set.add(event2);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), false);
  deepStrictEqual(set.has(event1), false);
  deepStrictEqual(set.has(event2), true);
});

await test("NSet.add (parameterized)", () => {
  const event0 = {
    id: "1",
    kind: 30000,
    pubkey: "abc",
    content: "",
    created_at: 0,
    sig: "",
    tags: [["d", "a"]],
  };
  const event1 = {
    id: "2",
    kind: 30000,
    pubkey: "abc",
    content: "",
    created_at: 1,
    sig: "",
    tags: [["d", "a"]],
  };
  const event2 = {
    id: "3",
    kind: 30000,
    pubkey: "abc",
    content: "",
    created_at: 2,
    sig: "",
    tags: [["d", "a"]],
  };

  const set = new NSet();
  set.add(event0);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), true);

  set.add(event1);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), false);
  deepStrictEqual(set.has(event1), true);

  set.add(event2);
  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), false);
  deepStrictEqual(set.has(event1), false);
  deepStrictEqual(set.has(event2), true);
});

await test("NSet.add (deletion)", () => {
  const event0 = {
    id: "1",
    kind: 0,
    pubkey: "abc",
    content: "",
    created_at: 0,
    sig: "",
    tags: [],
  };
  const event1 = {
    id: "2",
    kind: 5,
    pubkey: "abc",
    content: "",
    created_at: 0,
    sig: "",
    tags: [["e", "1"]],
  };

  const set = new NSet();

  set.add(event0);
  set.add(event1);
  set.add(event0);

  deepStrictEqual(set.size, 1);
  deepStrictEqual(set.has(event0), false);
  deepStrictEqual(set.has(event1), true);
});
