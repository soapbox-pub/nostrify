import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

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
      machina.close();
    }
  }

  assertEquals(results, [1, 2, 3]);
});

Deno.test('close & reopen', async () => {
  const machina = new Machina<number>();

  machina.push(777);
  for await (const msg of machina) {
    assertEquals(msg, 777);
    machina.close();
  }

  machina.push(888);
  for await (const msg of machina) {
    assertEquals(msg, 888);
    machina.close();
  }
});
