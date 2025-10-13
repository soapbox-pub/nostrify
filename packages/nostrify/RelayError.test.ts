import { test } from "node:test";
import { throws } from "node:assert";

import { RelayError } from "./RelayError.ts";

await test("Construct a RelayError from the reason message", () => {
  throws(
    () => {
      throw RelayError.fromReason("duplicate: already exists");
    },
    RelayError,
    "duplicate: already exists",
  );
});

await test("Throw a new RelayError if the OK message is false", () => {
  throws(
    () => {
      RelayError.assert(["OK", "yolo", false, "error: bla bla bla"]);
    },
    RelayError,
    "error: bla bla bla",
  );
});
