import { assert, assertEquals } from '@std/assert';

import { NSchema as n } from './NSchema.ts';

import nostrEvent from '../fixtures/event-1.json' with { type: 'json' };
import lnurlCallback from '../fixtures/callback.json' with { type: 'json' };

Deno.test('n.id', () => {
  assert(n.id().safeParse(nostrEvent.id).success);
  assert(n.id().safeParse(nostrEvent.pubkey).success);

  assert(!n.id().safeParse('abc').success);
  assert(!n.id().safeParse(nostrEvent.pubkey.slice(0, -1)).success);
});

Deno.test('n.bech32', () => {
  assert(n.bech32('npub').safeParse('npub108pv4cg5ag52nq082kd5leu9ffrn2gdg6g4xdwatn73y36uzplmq9uyev6').success);
  assert(n.bech32().safeParse(lnurlCallback.pr).success);

  assert(!n.bech32().safeParse('abc').success);
  assert(!n.bech32().safeParse(lnurlCallback.pr + '_').success);
});

Deno.test('n.filter', () => {
  assert(n.filter().safeParse({}).success);
  assert(n.filter().safeParse({ kinds: [0] }).success);
  assert(n.filter().safeParse({ ids: [nostrEvent.id] }).success);
  assert(n.filter().safeParse({ authors: [nostrEvent.pubkey] }).success);
  assert(n.filter().safeParse({ kinds: [1], '#t': ['nostrasia'] }).success);
  assert(n.filter().safeParse({ '#t': ['yolo'] }).success);

  assertEquals(
    n.filter().parse({ kinds: [1], '#t': ['nostrasia'], seenOn: ['wss://relay.mostr.pub/'] }),
    { kinds: [1], '#t': ['nostrasia'] },
  );

  assert(!n.filter().safeParse({ kinds: [0.5] }).success);
  assert(!n.filter().safeParse({ ids: ['abc'] }).success);
  assert(!n.filter().safeParse({ authors: ['abc'] }).success);
});
