import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import { getFilterLimit } from './getFilterLimit.ts';

await test('getFilterLimit returns Infinity for single replaceable kind + single author', () => {
  // Kind 0 (profile metadata) is replaceable
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'] }), Infinity);
  // Kind 3 (contacts) is replaceable
  deepStrictEqual(getFilterLimit({ kinds: [3], authors: ['alex'] }), Infinity);
  // Kind 10002 (relay list) is replaceable
  deepStrictEqual(getFilterLimit({ kinds: [10002], authors: ['alex'] }), Infinity);
});

await test('getFilterLimit returns Infinity for single addressable kind + single author + single #d', () => {
  // Kind 30023 (long-form content) is addressable
  deepStrictEqual(getFilterLimit({ kinds: [30023], authors: ['alex'], '#d': ['my-article'] }), Infinity);
  // Kind 30000 is addressable
  deepStrictEqual(getFilterLimit({ kinds: [30000], authors: ['alex'], '#d': ['test'] }), Infinity);
});

await test('getFilterLimit allows since/until on coordinate filters', () => {
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], since: 1000 }), Infinity);
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], until: 2000 }), Infinity);
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], since: 1000, until: 2000 }), Infinity);
  deepStrictEqual(getFilterLimit({ kinds: [30023], authors: ['alex'], '#d': ['x'], since: 1000, until: 2000 }), Infinity);
});

await test('getFilterLimit respects explicit limit on coordinate filters', () => {
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], limit: 5 }), 5);
  deepStrictEqual(getFilterLimit({ kinds: [30023], authors: ['alex'], '#d': ['x'], limit: 3 }), 3);
});

await test('getFilterLimit enforces limit for multiple authors with replaceable kind', () => {
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex', 'bob'] }), 2);
});

await test('getFilterLimit enforces limit for multiple kinds with replaceable kinds', () => {
  deepStrictEqual(getFilterLimit({ kinds: [0, 3], authors: ['alex'] }), 2);
});

await test('getFilterLimit returns Infinity for addressable kind without #d (not a coordinate filter, but nostr-tools also returns Infinity)', () => {
  // Without #d, nostr-tools getFilterLimit already returns Infinity for addressable kinds.
  // This is not a coordinate filter either, but the result is the same.
  deepStrictEqual(getFilterLimit({ kinds: [30023], authors: ['alex'] }), Infinity);
});

await test('getFilterLimit enforces limit for addressable kind with multiple #d values', () => {
  deepStrictEqual(getFilterLimit({ kinds: [30023], authors: ['alex'], '#d': ['a', 'b'] }), 2);
});

await test('getFilterLimit enforces limit when extra filter properties are present', () => {
  // Extra #e tag disqualifies it as a coordinate filter
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], '#e': ['eventid'] }), 1);
  // Extra #p tag
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], '#p': ['pubkey'] }), 1);
  // ids property
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: ['alex'], ids: ['abc'] }), 1);
});

await test('getFilterLimit returns 0 for empty arrays', () => {
  deepStrictEqual(getFilterLimit({ kinds: [], authors: ['alex'] }), 0);
  deepStrictEqual(getFilterLimit({ kinds: [0], authors: [] }), 0);
});

await test('getFilterLimit works normally for regular kinds', () => {
  // Kind 1 is regular, not replaceable
  deepStrictEqual(getFilterLimit({ kinds: [1], authors: ['alex'] }), Infinity);
  deepStrictEqual(getFilterLimit({ kinds: [1], authors: ['alex'], limit: 10 }), 10);
});

await test('getFilterLimit works normally for ids filter', () => {
  deepStrictEqual(getFilterLimit({ ids: ['abc', 'def'] }), 2);
});
