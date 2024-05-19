import { assertEquals } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { NIP98 } from './NIP98.ts';
import { NSecSigner } from './NSecSigner.ts';
import { N64 } from './utils/mod.ts';

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

Deno.test('NIP98.verify', async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request('https://example.com');

  const t = await NIP98.template(request);
  const event = await signer.signEvent(t);

  request.headers.set('authorization', `Nostr ${N64.encodeEvent(event)}`);

  const proof = await NIP98.verify(request);

  assertEquals(proof, event);
  assertEquals(proof.pubkey, await signer.getPublicKey());
});
