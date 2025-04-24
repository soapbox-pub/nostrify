import { assert, assertEquals } from '@std/assert';

import { NSchema as n } from './NSchema.ts';

import nostrEvent from '../../fixtures/event-1.json' with { type: 'json' };

Deno.test('n.id', () => {
  assert(n.id().safeParse(nostrEvent.id).success);
  assert(n.id().safeParse(nostrEvent.pubkey).success);

  assert(!n.id().safeParse('abc').success);
  assert(!n.id().safeParse(nostrEvent.pubkey.slice(0, -1)).success);
});

Deno.test('n.bech32', () => {
  assert(n.bech32('npub').safeParse('npub108pv4cg5ag52nq082kd5leu9ffrn2gdg6g4xdwatn73y36uzplmq9uyev6').success);
  assert(
    n.bech32().safeParse('lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu')
      .success,
  );

  assert(!n.bech32().safeParse('abc').success);
  assert(
    !n.bech32().safeParse(
      'lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu' + '_',
    ).success,
  );
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

Deno.test('n.event', () => {
  assert(n.event().safeParse(nostrEvent).success);

  assertEquals(
    n.event().parse(nostrEvent),
    {
      id: nostrEvent.id,
      kind: nostrEvent.kind,
      pubkey: nostrEvent.pubkey,
      tags: nostrEvent.tags,
      content: nostrEvent.content,
      created_at: nostrEvent.created_at,
      sig: nostrEvent.sig,
    },
  );

  assert(!n.event().safeParse({}).success);
  assert(!n.event().safeParse({ id: 'abc' }).success);
  assert(!n.event().safeParse({ kind: 0.5 }).success);
  assert(!n.event().safeParse({ pubkey: 'abc' }).success);
  assert(!n.event().safeParse({ tags: ['abc'] }).success);
  assert(!n.event().safeParse({ content: 1 }).success);
  assert(!n.event().safeParse({ created_at: -1 }).success);
  assert(!n.event().safeParse({ sig: 'abc' }).success);
});

Deno.test('n.metadata', () => {
  // Passing
  assertEquals(n.metadata().parse({ name: 'Alex' }).name, 'Alex');
  assertEquals(n.metadata().parse({ about: 'I am a developer.' }).about, 'I am a developer.');
  assertEquals(n.metadata().parse({ picture: 'https://nostrify.dev/1.png' }).picture, 'https://nostrify.dev/1.png');
  assertEquals(n.metadata().parse({ banner: 'https://nostrify.dev/2.png' }).banner, 'https://nostrify.dev/2.png');
  assertEquals(n.metadata().parse({ nip05: 'alex@gleasonator.dev' }).nip05, 'alex@gleasonator.dev');
  assertEquals(n.metadata().parse({ lud06: 'lnurl1acdacd' }).lud06, 'lnurl1acdacd');
  assertEquals(n.metadata().parse({ lud16: 'alex@alexgleason.me' }).lud16, 'alex@alexgleason.me');
  assertEquals(n.metadata().parse({ website: 'https://nostrify.dev' }).website, 'https://nostrify.dev');

  // Failing
  assertEquals(n.metadata().parse({ name: 1 }).name, undefined);
  assertEquals(n.metadata().parse({ about: 1 }).about, undefined);
  assertEquals(n.metadata().parse({ picture: 'abc' }).picture, undefined);
  assertEquals(n.metadata().parse({ banner: 'abc' }).banner, undefined);
  assertEquals(n.metadata().parse({ nip05: 'nostrify.dev' }).nip05, undefined);
  assertEquals(n.metadata().parse({ lud06: 'npub1abc' }).lud06, undefined);
  assertEquals(n.metadata().parse({ lud16: 'nostrify.dev' }).lud16, undefined);
  assertEquals(n.metadata().parse({ website: 'nostrify.dev' }).website, undefined);
});
