import { assertEquals } from '@std/assert';

import { NKinds } from './NKinds.ts';

Deno.test('NKinds', () => {
  assertEquals(NKinds.regular(1000), true);
  assertEquals(NKinds.regular(10000), false);
  assertEquals(NKinds.regular(0), false);
  assertEquals(NKinds.regular(44), true);
  assertEquals(NKinds.regular(45), false);
  assertEquals(NKinds.regular(100000), false);

  assertEquals(NKinds.replaceable(1000), false);
  assertEquals(NKinds.replaceable(10000), true);
  assertEquals(NKinds.replaceable(0), true);
  assertEquals(NKinds.replaceable(3), true);
  assertEquals(NKinds.replaceable(44), false);
  assertEquals(NKinds.replaceable(45), false);
  assertEquals(NKinds.replaceable(100000), false);

  assertEquals(NKinds.ephemeral(1000), false);
  assertEquals(NKinds.ephemeral(10000), false);
  assertEquals(NKinds.ephemeral(0), false);
  assertEquals(NKinds.ephemeral(3), false);
  assertEquals(NKinds.ephemeral(44), false);
  assertEquals(NKinds.ephemeral(45), false);
  assertEquals(NKinds.ephemeral(20000), true);
  assertEquals(NKinds.ephemeral(30000), false);
  assertEquals(NKinds.ephemeral(40000), false);
  assertEquals(NKinds.ephemeral(100000), false);

  assertEquals(NKinds.parameterizedReplaceable(1000), false);
  assertEquals(NKinds.parameterizedReplaceable(10000), false);
  assertEquals(NKinds.parameterizedReplaceable(0), false);
  assertEquals(NKinds.parameterizedReplaceable(3), false);
  assertEquals(NKinds.parameterizedReplaceable(44), false);
  assertEquals(NKinds.parameterizedReplaceable(45), false);
  assertEquals(NKinds.parameterizedReplaceable(20000), false);
  assertEquals(NKinds.parameterizedReplaceable(30000), true);
  assertEquals(NKinds.parameterizedReplaceable(40000), false);
  assertEquals(NKinds.parameterizedReplaceable(100000), false);
});
