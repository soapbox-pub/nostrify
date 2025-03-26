import { assertEquals } from '@std/assert';

import { CircularSet } from './CircularSet.ts';

Deno.test('CircularSet', () => {
  const set = new CircularSet<number>(3);

  set.add(1);
  set.add(2);
  set.add(3);
  set.add(3);
  set.add(4);

  assertEquals([...set], [2, 3, 4]);
});
