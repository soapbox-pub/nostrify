import { ErrorRelay, genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assert, assertFalse } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { WoTPolicy } from './WoTPolicy.ts';

function keygen(): { pubkey: string; seckey: Uint8Array } {
  const seckey = generateSecretKey();
  const pubkey = getPublicKey(seckey);
  return { pubkey, seckey };
}

Deno.test('WoTPolicy', async () => {
  const store = new MockRelay();
  const [alex, patrick, fiatjaf, replyguy] = [keygen(), keygen(), keygen(), keygen()];

  await store.event(genEvent({ kind: 3, tags: [['p', patrick.pubkey]] }, alex.seckey));
  await store.event(genEvent({ kind: 3, tags: [['p', fiatjaf.pubkey]] }, patrick.seckey));
  await store.event(genEvent({ kind: 3, tags: [['p', patrick.pubkey]] }, fiatjaf.seckey));

  const policy = new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 2 });

  assert((await policy.call(genEvent({}, alex.seckey)))[2]);
  assert((await policy.call(genEvent({}, patrick.seckey)))[2]);
  assert((await policy.call(genEvent({}, fiatjaf.seckey)))[2]);
  assertFalse((await policy.call(genEvent({}, replyguy.seckey)))[2]);
});

Deno.test('WoTPolicy constructor with error store', () => {
  const store = new ErrorRelay();
  const alex = keygen();

  // Ensure this doesn't result in an unhandled promise rejection.
  new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 1 });
});
