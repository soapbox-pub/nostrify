import { assertEquals, assertRejects } from '@std/assert';

import { Machina } from './Machina.ts';

Deno.test('push, iterate, & close', async () => {
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

  assertEquals(results, [1, 2, 3]);
});

Deno.test('close & reopen', async () => {
  const machina = new Machina<number>();

  machina.push(777);
  for await (const msg of machina) {
    assertEquals(msg, 777);
    break;
  }

  machina.push(888);
  for await (const msg of machina) {
    assertEquals(msg, 888);
    break;
  }
});

Deno.test('aborts with signal', async () => {
  const machina = new Machina<number>(AbortSignal.timeout(100));

  await assertRejects(async () => {
    for await (const _msg of machina) {
      // Should never reach here.
    }
  });
});

Deno.test('already aborted signal in constructor', async () => {
  const machina = new Machina<number>(AbortSignal.abort()); // doesn't throw

  await assertRejects(async () => {
    for await (const _msg of machina) {
      // Should never reach here.
    }
  });
});

Deno.test('push after abort', async () => {
  const controller = new AbortController();
  const machina = new Machina<number>(controller.signal);

  controller.abort();
  machina.push(999);

  await assertRejects(async () => {
    for await (const _msg of machina) {
      // Should never reach here.
    }
  }, DOMException);
});

Deno.test('multiple messages in queue', async () => {
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

  assertEquals(results, [10, 20, 30]);
});
