import { test } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { Machina } from "./Machina.ts";

await test("push, iterate, & close", async () => {
  const results = [];
  const machina = new Machina<number>();

  machina.push(1);
  machina.push(2);
  setTimeout(() => machina.push(3), 100);

  for await (const msg of machina) {
    results.push(msg);

    if (results.length === 3) {
      break;
    }
  }

  deepStrictEqual(results, [1, 2, 3]);
});

await test("close & reopen", async () => {
  const machina = new Machina<number>();

  machina.push(777);
  for await (const msg of machina) {
    deepStrictEqual(msg, 777);
    break;
  }

  machina.push(888);
  for await (const msg of machina) {
    deepStrictEqual(msg, 888);
    break;
  }
});

await test("aborts with signal", { timeout: 500 }, async () => {
  const controller = new AbortController();
  const machina = new Machina<number>(controller.signal);

  // Abort after a short delay
  setTimeout(() => controller.abort(), 50);

  await rejects(
    async () => {
      for await (const _msg of machina) {
        // Should never reach here.
      }
    },
    {
      name: 'AbortError',
      constructor: DOMException,
    }
  );
});

await test("already aborted signal in constructor", async () => {
  const machina = new Machina<number>(AbortSignal.abort()); // doesn't throw

  await rejects(async () => {
    for await (const _msg of machina) {
      // Should never reach here.
    }
  });
});

await test("push after abort", async () => {
  const controller = new AbortController();
  const machina = new Machina<number>(controller.signal);

  controller.abort();
  machina.push(999);

  await rejects(async () => {
    for await (const _msg of machina) {
      // Should never reach here.
    }
  }, DOMException);
});

await test("multiple messages in queue", async () => {
  const results = [];
  const machina = new Machina<number>();

  machina.push(10);
  machina.push(20);
  machina.push(30);

  for await (const msg of machina) {
    results.push(msg);

    if (results.length === 3) {
      break;
    }
  }

  deepStrictEqual(results, [10, 20, 30]);
});
