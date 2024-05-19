import { assertEquals } from '@std/assert';

import { NIP98 } from './NIP98.ts';

Deno.test('NIP98.template', async () => {
  const request = new Request('https://example.com');
  const event = await NIP98.template(request);

  assertEquals(event.kind, 27235);
  assertEquals(event.tags, [
    ['method', 'GET'],
    ['u', 'https://example.com/'],
  ]);
});

Deno.test('NIP98.template with payload', async () => {
  const request = new Request('https://example.com', {
    method: 'POST',
    body: 'Hello, world!',
  });
  const event = await NIP98.template(request);

  assertEquals(event.kind, 27235);
  assertEquals(event.tags, [
    ['method', 'POST'],
    ['u', 'https://example.com/'],
    ['payload', '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3'],
  ]);
});
