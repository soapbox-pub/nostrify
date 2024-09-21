import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { NostrMetadata } from '@nostrify/types';
import { assertEquals } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { DomainPolicy } from './DomainPolicy.ts';

Deno.test('DomainPolicy allows events from authors with a valid nip05', async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === 'alex@gleasonator.dev') {
        return { pubkey };
      } else {
        throw new Error('not found');
      }
    },
  });

  const metadata: NostrMetadata = { nip05: 'alex@gleasonator.dev' };
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, true, '']);
});

Deno.test('DomainPolicy rejects events from authors without a kind 0', async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);
  const event = genEvent({ kind: 1, content: 'hello world' });

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: author is missing a kind 0 event']);
});

Deno.test('DomainPolicy rejects events from authors with a missing nip05', async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);

  const sk = generateSecretKey();
  const metadata: NostrMetadata = {};
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: missing nip05']);
});

Deno.test('DomainPolicy rejects events from authors with a malformed nip05', async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);

  const sk = generateSecretKey();
  const metadata: NostrMetadata = { nip05: 'asdf' };
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: missing nip05']);
});

Deno.test('DomainPolicy rejects events from authors with an invalid nip05', async () => {
  const store = new MockRelay();

  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(_nip05: string) {
      const pubkey = getPublicKey(generateSecretKey());
      return { pubkey };
    },
  });

  const metadata: NostrMetadata = { nip05: 'alex@gleasonator.dev' };
  const sk = generateSecretKey();
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: mismatched nip05 pubkey']);
});

Deno.test('DomainPolicy rejects events from authors with a blacklisted nip05 domain', async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === 'bot@replyguy.dev') {
        return { pubkey };
      } else {
        throw new Error('not found');
      }
    },
    blacklist: ['replyguy.dev'],
  });

  const metadata: NostrMetadata = { nip05: 'bot@replyguy.dev' };
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: blacklisted nip05 domain']);
});

Deno.test("DomainPolicy rejects events from authors who aren't on a whitelisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === 'bot@replyguy.dev') {
        return { pubkey };
      } else {
        throw new Error('not found');
      }
    },
    whitelist: ['gleasonator.dev'],
  });

  const metadata: NostrMetadata = { nip05: 'bot@replyguy.dev' };
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, false, 'blocked: nip05 domain not in whitelist']);
});

Deno.test('DomainPolicy allows events from authors who are on a whitelisted domain', async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === 'alex@gleasonator.dev') {
        return { pubkey };
      } else {
        throw new Error('not found');
      }
    },
    whitelist: ['gleasonator.dev'],
  });

  const metadata: NostrMetadata = { nip05: 'alex@gleasonator.dev' };
  await store.event(genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk));
  const event = genEvent({ kind: 1, content: 'hello world' }, sk);

  const result = await policy.call(event);

  assertEquals(result, ['OK', event.id, true, '']);
});
