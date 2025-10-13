import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { NIP50 } from "./NIP50.ts";

await test("NIP50.parseInput", () => {
  deepStrictEqual(NIP50.parseInput(""), []);
  deepStrictEqual(NIP50.parseInput(" "), []);
  deepStrictEqual(NIP50.parseInput("hello"), ["hello"]);
  deepStrictEqual(NIP50.parseInput("hello world"), ["hello", "world"]);
  deepStrictEqual(NIP50.parseInput('hello  "world"'), ["hello", "world"]);

  deepStrictEqual(
    NIP50.parseInput('hello "world" "hello world"'),
    ["hello", "world", "hello world"],
  );

  deepStrictEqual(
    NIP50.parseInput("domain:gleasonator.dev"),
    [{ key: "domain", value: "gleasonator.dev" }],
  );

  deepStrictEqual(
    NIP50.parseInput("domain: yolo"),
    ["domain:", "yolo"],
  );

  deepStrictEqual(
    NIP50.parseInput("domain:localhost:8000"),
    [{ key: "domain", value: "localhost:8000" }],
  );

  deepStrictEqual(
    NIP50.parseInput('name:John "New York" age:30 hobbies:programming'),
    [
      { key: "name", value: "John" },
      "New York",
      { key: "age", value: "30" },
      { key: "hobbies", value: "programming" },
    ],
  );
});

await test("NIP50.parseInput with negated token", () => {
  deepStrictEqual(
    NIP50.parseInput("-reply:true"),
    [{ key: "-reply", value: "true" }],
  );

  deepStrictEqual(
    NIP50.parseInput("hello -reply:true"),
    ["hello", { key: "-reply", value: "true" }],
  );

  deepStrictEqual(
    NIP50.parseInput("-media:true -reply:true"),
    [{ key: "-media", value: "true" }, { key: "-reply", value: "true" }],
  );
});
